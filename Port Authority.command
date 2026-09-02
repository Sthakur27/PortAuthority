#!/bin/zsh
cd "/Users/sid/Documents/ChatGPT/tools" || exit 1
if curl -fsS "http://127.0.0.1:4377/api/ports" >/dev/null 2>&1; then
  open "http://127.0.0.1:4377"
  exit 0
fi

npm start &
port_authority_pid=$!
trap 'kill "$port_authority_pid" 2>/dev/null' EXIT INT TERM

for attempt in {1..40}; do
  if curl -fsS "http://127.0.0.1:4377/api/ports" >/dev/null 2>&1; then
    open "http://127.0.0.1:4377"
    wait "$port_authority_pid"
    exit $?
  fi
  sleep 0.1
done

echo "Port Authority did not start."
wait "$port_authority_pid"
