import os

for root, dirs, files in os.walk(r'C:\Users\owais\Downloads\synaptwin-deploy-ready\synaptwin-root\s24_frontend\src'):
    for f in files:
        if f.endswith('.jsx') or f.endswith('.js'):
            fp = os.path.join(root, f)
            with open(fp, 'r', encoding='utf-8') as f:
                content = f.read()
                if 'tier' in content.lower() and 'fully' in content.lower():
                    print(f'File: {os.path.join(root, f)}')