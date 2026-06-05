import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const CLI_PORT = parseInt(process.env.HELM_CLI_PORT || '4625', 10);
const HOST = '127.0.0.1';

const clients = new Set();

function send(sock, obj) { try { sock.write(JSON.stringify(obj) + '\n'); } catch {} }


export function broadcast(obj) { for (const s of clients) send(s, obj); }


export const mirrorReply = (text, from = 'helm') => broadcast({ type: 'reply', text, from });
export const mirrorEcho  = (text, from)           => broadcast({ type: 'echo', text, from });
export const mirrorStatus = text                  => broadcast({ type: 'status', text });
export const mirrorAttach = files                 => broadcast({ type: 'attach', files: Array.isArray(files) ? files : [files] });
export const hasTerminals = () => clients.size > 0;





export function startCliBridge(onMessage) {
  const server = net.createServer(sock => {
    sock.setEncoding('utf8');
    clients.add(sock);
    send(sock, { type: 'info', text: `connected to Helm on ${os.hostname()} (${process.platform}). Shared with Discord/iMessage.` });

    let buf = '';
    sock.on('data', chunk => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.type === 'hello') { send(sock, { type: 'info', text: 'ready' }); continue; }
        if (msg.type === 'msg' && typeof msg.text === 'string' && msg.text.trim()) {

          for (const s of clients) if (s !== sock) send(s, { type: 'echo', text: msg.text, from: 'you (terminal)' });


          try { onMessage(msg.text.trim(), reply => broadcast({ type: 'reply', text: reply, from: 'helm' }), msg.conv); } catch (e) {
            send(sock, { type: 'info', text: 'error: ' + (e?.message || e) });
          }
        }
      }
    });
    const drop = () => clients.delete(sock);
    sock.on('close', drop); sock.on('error', drop);
  });

  server.on('error', e => {

    console.error(`[cli-bridge] not started (${e.code || e.message}). Terminal client won't connect; Discord/iMessage unaffected.`);
  });
  server.listen(CLI_PORT, HOST, () => console.log(`⌨️  Terminal bridge: 127.0.0.1:${CLI_PORT}  (run \`node cli.js\` in another terminal)`));
  return server;
}
