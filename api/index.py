import sys
import os

# Add parent directory to path so server.py can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from server import app

# Vercel entrypoint
handler = app

if __name__ == '__main__':
    app.run()
