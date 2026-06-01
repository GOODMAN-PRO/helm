# Fleet setup (private — never committed)

**Fleet status: NOT STARTED.**

The owner told the setup wizard they run Helm on MORE THAN ONE device. The second peer is not
connected yet. Before the owner interview, get the two machines linked as equal peers:

1. Confirm the OTHER peer's reachable address — an SSH target like `user@host`, a LAN IP, or a
   Tailscale machine name. It may already be in `.env` as `HELM_WIN_HOST`.
2. Test the link, non-interactively:  `ssh -o BatchMode=yes -o ConnectTimeout=10 <host> echo ok`
3. If SSH/Tailscale or keys are missing, walk the owner through it. Tailscale is easiest — install it
   on both machines, sign into the same tailnet, then use the machine name as the host.
4. Make sure the other peer has its OWN full Helm install (its own code + tools — equal peer, not a
   stripped brain dir). Default install dir is `~/helm` (`HELM_WIN_DIR`).
5. When the link works, write what you set up below and change the status line above to **CONNECTED**.

If the owner says "skip" or "later", set the status to **DEFERRED** and continue. This file is
gitignored — it stays on this machine and is never published.

## The other peer(s)
<!-- name/OS of the other machine(s); SSH host or Tailscale name; install dir -->

## How they're linked
<!-- SSH key path, Tailscale tailnet, anything needed to reconnect later -->

## Notes
<!-- anything that helps re-establish or debug the fleet link -->
