import urllib.request, json
try:
    response = urllib.request.urlopen('http://localhost:5000/api/simulation/run', timeout=10)
    data = json.load(response)
    for h in data['hourly']:
        if h['hour'] in [17,18,19,20,21,22]:
            tfs = h.get('tier_fully_served', {})
            bu = h.get('battery_used_kw', 0)
            print(f"hour {h['hour']}: tfs={tfs}, batt={h.get('battery_used_kw', 0)}, rej={h.get('rejected_kw', 0)}")
except Exception as e:
    print('Error:', e)