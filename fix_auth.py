import re

filepath = r'c:\Users\BRAHIOM BASHIR\Downloads\BUAS-Production\app\routes.py'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# We want to remove the block:
#         auth = request.authorization
#         if not auth or not check_auth(auth.username, auth.password):
#             return authenticate()
# But ONLY if the function has @login_required

def replace_func(match):
    # match.group(0) is the entire function block matched
    func_text = match.group(0)
    if '@login_required' in func_text:
        # Remove the auth check block
        func_text = re.sub(
            r'[ \t]*auth = request\.authorization\n[ \t]*if not auth or not check_auth\(auth\.username, auth\.password\):\n[ \t]*return authenticate\(\)\n',
            '',
            func_text
        )
    return func_text

# Regex to match a route definition until the next route or end of file
new_content = re.sub(r'@routes\.route.*?(?=\n@routes\.route|\Z)', replace_func, content, flags=re.DOTALL)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Auth checks removed from frontend routes.")
