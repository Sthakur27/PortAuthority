# Port Authority on this machine

- Always run Port Authority on port **4377**, at `http://127.0.0.1:4377`.
- This is an explicit exception to the remote box's general 3000-3010 web app port range.
- Use the default `npm start` port, or explicitly set `PORT_AUTHORITY_PORT=4377`. Do not choose another port.
- Before starting, check whether Port Authority is already running on 4377 and reuse it when possible.
- If another application occupies 4377, report the conflict instead of stopping it or selecting a different port.
