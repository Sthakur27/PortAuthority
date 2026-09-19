
# Port Authority

The **Processes** tab groups your open apps and their helpers by estimated resident memory. Search, sort by memory or CPU, select multiple apps, and choose Quit. Normal app Quit uses macOS termination requests so save prompts can appear. Force Quit is a separate confirmed action and can lose unsaved work. Developer processes receive SIGTERM for Quit. macOS services and other users' processes are excluded; the dashboard and its ancestors are protected. Selections are checked against process start times before signaling and expire after two minutes. Memory totals sum RSS (shared pages may be counted twice), not Activity Monitor's memory footprint. Refreshes every five seconds while the tab is active.

Turn on **Quick quit** beside apps you are happy to close, then use **Free up memory** to request normal Quit for all running marked apps (independent of table filters). Choices are remembered by app path in this browser's local storage, including apps that are no longer running; remove them using the × on their saved chip. Nothing quits automatically, and protected apps are always skipped. The action refreshes process identities first and never escalates to Force Quit. Reported memory is an estimate, not a promise of RAM recovered.

The top memory bar estimates physical RAM categories from macOS `vm_stat`: apps/services (anonymous minus purgeable pages), system/wired, compressed storage, and remaining cache/free RAM. Its usage indicator turns amber at 75% and red at 90%; this is an occupancy threshold, **not macOS Memory Pressure** or an exact Activity Monitor replica. Wired allocations can include apps, and anonymous allocations include background services. Failed readings display unavailable instead of a healthy zero. The Quick quit donut shows each running, unprotected marked app's share of the crew's summed RSS; it is not a partition of physical RAM. The five largest apps get individual slices, with remaining marked apps grouped together.

Your harbor master for localhost. Port Authority watches ports 3000–3999, identifies the process and its likely launch environment, and lets you open or stop local development servers from one dashboard.


<img width="1776" height="796" alt="Screenshot 2026-09-02 at 2 16 09 PM" src="https://github.com/user-attachments/assets/64be7216-b378-47d4-9f17-fa13d5e8f251" />
<img width="1784" height="813" alt="Screenshot 2026-09-02 at 2 16 18 PM" src="https://github.com/user-attachments/assets/367d6c1d-b0fd-4e9c-9cc9-91261541b2a4" />
<img width="1345" height="627" alt="image" src="https://github.com/user-attachments/assets/0bd91d25-b7ec-4a22-b599-0e1c8a624bf5" />

<img width="390" height="273" alt="Screenshot 2026-09-02 at 2 23 44 PM" src="https://github.com/user-attachments/assets/09526d49-9d2f-43a5-ab8c-a3e00283a421" />


## Launch

On macOS, double-click **Port Authority.command**. You can also run:

```sh
npm start
```

Then visit [http://127.0.0.1:4377](http://127.0.0.1:4377).

## What it shows

- Listening port, PID, user, runtime, and command
- Project working directory
- Best-effort Codex, Claude, terminal, and editor detection through process ancestry
- One-click graceful termination with a force-stop fallback
- Git branch badges for processes running inside repositories
- Local ngrok tunnel management: launch, list, retarget, copy, open, and close

Port Authority binds only to `127.0.0.1`; its core port monitor has no external services or dependencies.

## ngrok tunnel yard

If the `ngrok` CLI is installed and authenticated, the tunnel yard reads the agent API on `127.0.0.1:4040`. Launching a tunnel can wake a sleeping agent automatically. Port Authority never reads or stores your ngrok authtoken.
