// Helm CLI bridge — lets the terminal talk to the ONE already-running Helm (the Discord/iMessage
// service), instead of spawning a second brain. There is exactly one brain, one conversation, one
// session; the terminal is just another window into it.
//
// Transport: a loopback TCP server (127.0.0.1 only — never exposed) speaking newline-delimited JSON.
//   client → server : {type:'msg', text}            a line the owner typed in the terminal
//                      {type:'hello'}                announce a new terminal (gets a banner back)
//   server → client : {type:'reply', text, from}    Helm's reply (mirrored to every terminal)
//                     {type:'echo', text, from}      a message that arrived on ANOTHER channel
//                     {type:'status', text}          live progress ("thinking… · 12s")
//                     {type:'info', text}            one-off notices (banner, errors)
//                     {type:'attach', files:[...]}   files Helm produced (images/screenshots); the
//                                                    terminal opens images in the OS default viewer
//
// "Mirror everything both ways": every owner message (terminal/Discord/iMessage) and every Helm reply
// is broadcast to all connected terminals, so the terminal mirrors the whole conversation live.
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const CLI_PORT = parseInt(process.env.HELM_CLI_PORT || '4625', 10);
const HOST = '127.0.0.1';   // loopback only — this is a local control channel, never network-exposed

const clients = new Set();   // connected terminal sockets

function send(sock, obj) { try { sock.write(JSON.stringify(obj) + '\n'); } catch {} }

// Broadcast to every connected terminal. Used for replies, cross-channel echoes, and status.
export function broadcast(obj) { for (const s of clients) send(s, obj); }

// Convenience wrappers the brain calls.
export const mirrorReply = (text, from = 'helm') => broadcast({ type: 'reply', text, from });
export const mirrorEcho  = (text, from)           => broadcast({ type: 'echo', text, from });
export const mirrorStatus = text                  => broadcast({ type: 'status', text });
export const mirrorAttach = files                 => broadcast({ type: 'attach', files: Array.isArray(files) ? files : [files] });
export const hasTerminals = () => clients.size > 0;

// Start the bridge server. `onMessage(text, reply)` is called when a terminal sends a line:
//   text  : what the owner typed
//   reply : (str) => void  — send a reply back to the terminals (the brain also calls mirrorReply)
// Returns the net.Server (or null if it couldn't bind — the bot keeps running regardless).
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
          // mirror the owner's terminal line to OTHER terminals, then hand it to the brain
          for (const s of clients) if (s !== sock) send(s, { type: 'echo', text: msg.text, from: 'you (terminal)' });
          // reply() broadcasts to EVERY terminal (so all mirror it) exactly once — the brain must NOT
          // also call mirrorReply for the same answer, or the originating terminal would see it twice.
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
    // EADDRINUSE = another Helm (or stale process) already owns the port; just skip the bridge.
    console.error(`[cli-bridge] not started (${e.code || e.message}). Terminal client won't connect; Discord/iMessage unaffected.`);
  });
  server.listen(CLI_PORT, HOST, () => console.log(`⌨️  Terminal bridge: 127.0.0.1:${CLI_PORT}  (run \`node cli.js\` in another terminal)`));
  return server;
}
