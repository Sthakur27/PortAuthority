
# Port Authority

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
