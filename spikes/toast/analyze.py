#!/usr/bin/env python3
"""Join the server's latency CSV with the device log.

A toast is counted as drawn when the system notification renderer claims input
priority (SYSTEMUI_PRIORITY) within WINDOW_MS after the cue was sent. Device
syslog timestamps are UTC wall clock; the server CSV carries the per-send device
clock offset, so send_to_render_ms = log time - offset - send time.

usage: analyze.py latencies-<tag>.csv devlog-<tag>.(raw|txt)
       rewrites the CSV with send_to_render_ms filled in and prints p50/p95
"""
import csv, re, sys, datetime, statistics

WINDOW_MS = 3000
RX = re.compile(r"^(\w{3} +\d+ \d\d:\d\d:\d\d\.\d+) (.*)$")


def ts(s):
    d = datetime.datetime.strptime("2026 " + re.sub(r" +", " ", s), "%Y %b %d %H:%M:%S.%f")
    return d.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000


def main(csv_path, log_path):
    claims = []
    for line in open(log_path, errors="replace"):
        m = RX.match(line)
        if m and "Client Requesting Priority 224: SYSTEMUI_PRIORITY" in m.group(2) and "notification" in m.group(2):
            claims.append(ts(m.group(1)))
    rows = list(csv.DictReader(open(csv_path)))
    assert rows, "empty CSV, nothing measured"
    lat = []
    for r in rows:
        r["send_to_render_ms"] = ""
        if r["clock_offset_ms"] and r["send_to_posted_ms"]:
            t_send_dev = float(r["t_send_ms"]) + float(r["clock_offset_ms"])
            hit = [c for c in claims if 0 <= c - t_send_dev <= WINDOW_MS]
            if hit:
                r["send_to_render_ms"] = f"{hit[0] - t_send_dev:.1f}"
                lat.append(hit[0] - t_send_dev)
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    n = len(rows)
    print(f"{csv_path}: sends={n} rendered={len(lat)}")
    if lat:
        lat.sort()
        p95 = lat[min(len(lat) - 1, int(round(0.95 * (len(lat) - 1))))]
        print(f"send->render ms: p50={statistics.median(lat):.0f} p95={p95:.0f} max={lat[-1]:.0f} min={lat[0]:.0f}")
        print(f"within 2000 ms: {sum(1 for x in lat if x <= 2000)}/{n}")


main(sys.argv[1], sys.argv[2])
