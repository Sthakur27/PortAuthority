# Port Authority

Your harbor master for localhost. Port Authority watches ports 3000–3999, identifies the process and its likely launch environment, and lets you open or stop local development servers from one dashboard.


<img width="1776" height="796" alt="Screenshot 2026-09-02 at 2 16 09 PM" src="https://github.com/user-attachments/assets/64be7216-b378-47d4-9f17-fa13d5e8f251" />
<img width="1784" height="813" alt="Screenshot 2026-09-02 at 2 16 18 PM" src="https://github.com/user-attachments/assets/367d6c1d-b0fd-4e9c-9cc9-91261541b2a4" />

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

Port Authority binds only to `127.0.0.1` and has no external services or dependencies.
