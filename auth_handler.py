import requests
import sys

def get_copyparty_cookie(url, username, password):
    """
    Simulates a login to copyparty to extract the cppws session cookie.
    """
    login_url = f"{url.rstrip('/')}/?login"
    payload = {
        'u': username,
        'p': password
    }
    
    print(f"Attempting login to {login_url}...")
    try:
        response = requests.post(login_url, data=payload, allow_redirects=False, timeout=10)
        
        # Copyparty usually sets 'cppws' cookie on successful login
        cookies = response.cookies.get_dict()
        if 'cppws' in cookies:
            print("Successfully extracted authentication cookie.")
            return f"Cookie,cppws={cookies['cppws']}"
        else:
            print("Error: Authentication successful but cookie 'cppws' not found in response.")
            print("Check if the server uses a different authentication method.")
            return None
            
    except Exception as e:
        print(f"Connection failed: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python auth_handler.py <URL> <Username> <Password>")
        sys.exit(1)
        
    url, user, pwd = sys.argv[1:4]
    header = get_copyparty_cookie(url, user, pwd)
    if header:
        print(f"RCLONE_HEADER: {header}")
    else:
        sys.exit(1)
