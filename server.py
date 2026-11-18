from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json, tempfile, subprocess

ROOT = Path(__file__).resolve().parent
PORT = 8736
ORIGIN = f'http://127.0.0.1:{PORT}'

class Studio(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT/'public'), **kwargs)

    def do_POST(self):
        if self.path != '/ask' or self.headers.get('Origin') != ORIGIN or self.headers.get('Host') != ORIGIN[7:]:
            return self.send_error(403)
        try:
            size = int(self.headers['Content-Length'])
            if not 0 < size <= 16000:
                return self.send_error(413)
            data = json.loads(self.rfile.read(size))
            lesson = json.loads((ROOT/'public/lessons.json').read_text())[int(data['lesson'])]
            sentence = lesson['lines'][int(data['line'])][0]
            prompt = '你是意大利语老师，用中文简洁回答，给一个意大利语例句。只回答语言问题，不使用任何工具。\n对话：' + str(lesson['lines']) + '\n当前句：' + sentence + '\n学生问题：' + str(data['question'])[:1500]
            with tempfile.TemporaryDirectory() as tmp:
                answer = Path(tmp)/'answer.txt'
                subprocess.run(['codex','exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','-s','read-only','--disable','shell_tool','-o',str(answer),'-'], input=prompt,text=True,cwd=tmp,capture_output=True,timeout=120,check=True)
                body = answer.read_bytes()
            self.send_response(200)
        except (ValueError, TypeError, IndexError, KeyError):
            return self.send_error(400)
        except (OSError, subprocess.SubprocessError):
            self.send_response(503)
            body = '导师暂时无法连接。请检查网络，并在终端运行 codex login status 确认登录后重试。'.encode()
        self.send_header('Content-Type','text/plain; charset=utf-8')
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1',PORT),Studio).serve_forever()
