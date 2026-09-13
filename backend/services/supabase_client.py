"""
Supabase client helper for FastAPI backend.
Provides secure client initialization and user JWT token verification.
"""

import os
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_env_path = os.path.join(_backend_dir, ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path)
load_dotenv()

def _is_valid_service_key(key: Optional[str]) -> bool:
    """Return True if service key is set to an actual key and not placeholder."""
    if not key:
        return False
    placeholder = "your_service_role_key_here"
    return key.strip() != placeholder and len(key.strip()) > 20

def get_supabase_admin_key() -> str:
    """Get service role key if available and valid, otherwise fallback to anon key."""
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if _is_valid_service_key(service_key):
        return service_key.strip()
    
    anon_key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if anon_key and len(anon_key.strip()) > 10:
        return anon_key.strip()
    
    raise RuntimeError("No valid Supabase API key (service or anon) found in backend environment.")

def get_supabase_client(token: Optional[str] = None) -> Client:
    """
    Return a Supabase client.
    - If a valid service role key is present: returns admin client.
    - If service role key is not configured: returns anon client with postgrest.auth(token)
      so database operations run under the authenticated user's Postgres RLS context.
    """
    url = os.environ.get("SUPABASE_URL")
    if not url:
        raise RuntimeError("SUPABASE_URL is missing in environment.")
    
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if _is_valid_service_key(service_key):
        return create_client(url, service_key.strip())
    
    # Fallback to anon key with user session token
    anon_key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if not anon_key:
        raise RuntimeError("Neither SUPABASE_SERVICE_KEY nor SUPABASE_ANON_KEY is configured.")
    
    client = create_client(url, anon_key.strip())
    if token:
        client.postgrest.auth(token)
    return client

def verify_access_token(token: str) -> dict:
    """
    Verify Supabase access token (JWT) using Supabase Auth.
    Returns dict with user id and email if valid, or raises Exception if invalid.
    """
    if not token or not token.strip():
        raise ValueError("Access token cannot be empty.")
    
    url = os.environ.get("SUPABASE_URL")
    key = get_supabase_admin_key()
    client = create_client(url, key)
    
    user_response = client.auth.get_user(token.strip())
    if not user_response or not user_response.user or not user_response.user.id:
        raise ValueError("Invalid or expired session token.")
    
    return {
        "id": user_response.user.id,
        "email": user_response.user.email,
        "user": user_response.user,
    }
