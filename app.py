import os
import subprocess
import sys

def main():
    print("Iniciando setup do Next.js dentro do container Gradio (Bypass)...")
    
    # Configurar a porta obrigatória do Hugging Face
    os.environ["PORT"] = "7860"
    
    try:
        # Instalar dependências (isso baixa o ffmpeg-static tbm)
        print("Rodando npm install...")
        subprocess.run(["npm", "install"], check=True)
        
        # Build do Next.js
        print("Rodando npm run build...")
        subprocess.run(["npm", "run", "build"], check=True)
        
        # Iniciar o servidor
        print("Iniciando o servidor Next.js na porta 7860...")
        # Usa sys.executable ou subprocess para manter o processo vivo
        subprocess.run(["npm", "run", "start", "--", "-p", "7860"], check=True)
        
    except Exception as e:
        print(f"Erro fatal: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
