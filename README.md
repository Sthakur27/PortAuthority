# Port Authority

Your harbor master for localhost. Port Authority watches ports 3000–3999, identifies the process and its likely launch environment, and lets you open or stop local development servers from one dashboard.

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
