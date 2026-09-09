import os
import subprocess
import sys
import urllib.request

NODE_URL = "https://nodejs.org/dist/v20.11.1/node-v20.11.1-linux-x64.tar.xz"
NODE_DIR = "/tmp/node"
NODE_BIN = f"{NODE_DIR}/node-v20.11.1-linux-x64/bin"

def install_node():
    if not os.path.exists(NODE_BIN):
        print("Baixando Node.js...")
        os.makedirs(NODE_DIR, exist_ok=True)
        tar_path = "/tmp/node.tar.xz"
        urllib.request.urlretrieve(NODE_URL, tar_path)
        print("Extraindo Node.js...")
        subprocess.run(["tar", "-xf", tar_path, "-C", NODE_DIR], check=True)
    
    # Adiciona o Node ao PATH do sistema pra o Python achar o comando npm
    os.environ["PATH"] = f"{NODE_BIN}:{os.environ.get('PATH', '')}"
    print(f"Node.js configurado no PATH: {NODE_BIN}")

def main():
    print("Iniciando setup do Next.js dentro do container Gradio (Bypass)...")
    
    os.environ["PORT"] = "7860"
    
    try:
        install_node()
        
        print("Rodando npm install...")
        subprocess.run(["npm", "install"], check=True)
        
        print("Rodando npm run build...")
        subprocess.run(["npm", "run", "build"], check=True)
        
        print("Iniciando o servidor Next.js na porta 7860...")
        subprocess.run(["npm", "run", "start", "--", "-p", "7860"], check=True)
        
    except Exception as e:
        print(f"Erro fatal: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
