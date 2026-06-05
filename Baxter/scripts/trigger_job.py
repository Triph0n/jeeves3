import sys
import urllib.request
import json
import ctypes

def main():
    if len(sys.argv) < 2:
        return
    job_name = sys.argv[1]
    url = f"http://127.0.0.1:8765/api/jobs/{job_name}"
    try:
        req = urllib.request.Request(url, method="POST")
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read().decode('utf-8'))
        
        if data.get('status') == 'failed':
            msg = data.get('message', 'Neznámá chyba.')
            ctypes.windll.user32.MessageBoxW(0, msg, "Baxter", 0x10)
        else:
            msg = data.get('message', 'Hotovo.')
            # Success notification could be silent or just a small popup.
            ctypes.windll.user32.MessageBoxW(0, msg, "Baxter", 0x40)
            
    except Exception as e:
        ctypes.windll.user32.MessageBoxW(0, f"Nepodařilo se připojit k Baxterovi (je spuštěný?)\n{str(e)}", "Baxter", 0x10)

if __name__ == '__main__':
    main()
