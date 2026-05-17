import os
import re
import glob

# Matches the "with:\n  version: 9\n" block that follows pnpm/action-setup@v4
# and removes it, leaving just the action line
pattern = re.compile(
    r'([ \t]*- uses: pnpm/action-setup@v4\n)[ \t]+with:\n[ \t]+version: 9\n',
    re.MULTILINE
)

workflow_dir = os.path.join(os.path.dirname(__file__), '..', '.github', 'workflows')
for path in glob.glob(os.path.join(workflow_dir, '*.yml')):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    new_content = pattern.sub(r'\1', content)
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Fixed: {os.path.basename(path)}')
    else:
        print(f'No change: {os.path.basename(path)}')
