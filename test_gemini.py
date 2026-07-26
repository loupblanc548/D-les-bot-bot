import urllib.request, json

key = "AIzaSyC70mbVvKuOr485WxPDco1Tj8OwJS1Ny1s"
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
data = json.dumps({"contents":[{"parts":[{"text":"Dis bonjour en 3 mots"}]}]}).encode()
req = urllib.request.Request(url, data=data, headers={"Content-Type":"application/json"})
try:
    resp = urllib.request.urlopen(req)
    print("SUCCESS:", resp.read().decode()[:500])
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}:", e.read().decode()[:500])
