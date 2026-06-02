#!/usr/bin/env node
// net.mjs — CLI for the Helm network. Each Helm uses this to join the web and talk to friends.
//   node net.mjs whoami                 show my handle + id + hub
//   node net.mjs handle <name>          set my handle
//   node net.mjs register               publish my handle->key on the hub
//   node net.mjs add <handle>           send a friend request
//   node net.mjs accept <handle>        accept a pending request
//   node net.mjs friends                list friends + statuses
//   node net.mjs send <handle> <text>   message an accepted friend
//   node net.mjs poll                   fetch inbox (friend requests/accepts + messages)
// Hub via HELM_HUB_URL; identity/friends state under HELM_NET_DIR (default workspace/network).

import { fileURLToPath } from 'node:url';
import { publicIdentity, setHandle } from './identity.mjs';
import { register, addFriend, acceptFriend, listFriends, sendMessage, poll, HUB_URL } from './friends.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const out = o => console.log(JSON.stringify(o));

async function main() {
  switch (cmd) {
    case 'whoami':   return out({ ok: true, ...publicIdentity(), hub: HUB_URL });
    case 'handle':   return out({ ok: true, handle: setHandle(rest[0] || '') });
    case 'register': return out(await register());
    case 'add':      return out(await addFriend(rest[0] || ''));
    case 'accept':   return out(await acceptFriend(rest[0] || ''));
    case 'friends':  return out({ ok: true, friends: listFriends() });
    case 'send':     return out(await sendMessage(rest[0] || '', rest.slice(1).join(' ')));
    case 'poll':     return out(await poll());
    default:
      console.error('usage: net.mjs whoami | handle <name> | register | add <handle> | accept <handle> | friends | send <handle> <text> | poll');
      process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
