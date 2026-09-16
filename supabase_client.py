import os
import json
import urllib.request
import urllib.parse
import datetime

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://bstzmwnxskeewzxxqesb.supabase.co').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzdHptd254c2tlZXd6eHhxZXNiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTU0NjcyMywiZXhwIjoyMTA1MTIyNzIzfQ.Q8ayX2WLJpRjk4RzQGOGYqJgIKAUKgIE0dthTjDVnCQ')

class SupabaseDB:
    @staticmethod
    def _headers(prefer=None):
        h = {
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Content-Type': 'application/json'
        }
        if prefer:
            h['Prefer'] = prefer
        return h

    @classmethod
    def request(cls, method, endpoint, params=None, body=None, prefer='return=representation'):
        url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
        if params:
            # Build query string without escaping commas or dots in PostgREST operators
            query_parts = []
            for k, v in params.items():
                query_parts.append(f"{k}={v}")
            url += "?" + "&".join(query_parts)

        data = json.dumps(body).encode('utf-8') if body is not None else None
        headers = cls._headers(prefer)
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                resp_text = resp.read().decode('utf-8')
                return json.loads(resp_text) if resp_text else None
        except urllib.error.HTTPError as e:
            err_text = e.read().decode('utf-8') if hasattr(e, 'read') else str(e)
            print(f"[SupabaseDB Error] {method} {url} -> {e.code}: {err_text}")
            raise Exception(f"Supabase error ({e.code}): {err_text}")
        except Exception as e:
            print(f"[SupabaseDB Network Error] {method} {url} -> {e}")
            raise

    # ── USERS ───────────────────────────────────────────────────
    @classmethod
    def get_user_by_username_or_email(cls, login_val):
        # login_val can be username or email
        safe_val = urllib.parse.quote(login_val)
        res = cls.request('GET', 'users', {'or': f'(username.eq.{safe_val},email.eq.{safe_val})', 'select': '*'})
        return res[0] if res else None

    @classmethod
    def get_user_by_phone(cls, phone_val):
        if not phone_val:
            return None
        import re
        digits = re.sub(r'\D', '', str(phone_val))
        if not digits:
            return None
        if len(digits) >= 9:
            sub = urllib.parse.quote(digits[-9:])
            res = cls.request('GET', 'users', {'phone': f'ilike.*{sub}*', 'select': '*'})
            return res[0] if res else None
        else:
            safe_p = urllib.parse.quote(phone_val)
            res = cls.request('GET', 'users', {'phone': f'eq.{safe_p}', 'select': '*'})
            return res[0] if res else None

    @classmethod
    def get_user_by_id(cls, user_id):
        res = cls.request('GET', 'users', {'id': f'eq.{user_id}', 'select': '*'})
        return res[0] if res else None

    @classmethod
    def get_all_users_for_radar(cls):
        # Order pending users first, then id desc
        res = cls.request('GET', 'users', {'select': '*', 'order': 'id.desc'})
        if not res:
            return []
        # Sort pending to the top
        return sorted(res, key=lambda u: (0 if u.get('status') == 'pending' else 1, -u.get('id', 0)))

    @classmethod
    def create_user(cls, user_data):
        res = cls.request('POST', 'users', body=user_data)
        return res[0] if res else None

    @classmethod
    def update_user(cls, user_id, update_data):
        res = cls.request('PATCH', 'users', params={'id': f'eq.{user_id}'}, body=update_data)
        return res[0] if res else None

    @classmethod
    def delete_user(cls, user_id):
        return cls.request('DELETE', 'users', params={'id': f'eq.{user_id}'})

    # ── PHONE VERIFICATIONS ────────────────────────────────────
    @classmethod
    def upsert_phone_code(cls, phone, code):
        now_iso = datetime.datetime.now().isoformat()
        body = [{'phone': phone, 'code': code, 'created_at': now_iso}]
        return cls.request('POST', 'phone_verifications', body=body, prefer='resolution=merge-duplicates')

    @classmethod
    def get_latest_phone_code(cls, phone1, phone2):
        p1 = urllib.parse.quote(phone1)
        p2 = urllib.parse.quote(phone2)
        res = cls.request('GET', 'phone_verifications', {
            'or': f'(phone.eq.{p1},phone.eq.{p2})',
            'order': 'created_at.desc',
            'limit': '1',
            'select': 'code'
        })
        return res[0]['code'] if res else None

    # ── LOCATIONS ──────────────────────────────────────────────
    @classmethod
    def get_locations(cls, query_params=None):
        params = {'select': '*'}
        if query_params:
            for k, v in query_params.items():
                params[k] = v
        return cls.request('GET', 'locations', params) or []

    @classmethod
    def get_location_by_id(cls, loc_id):
        res = cls.request('GET', 'locations', {'id': f'eq.{loc_id}', 'select': '*'})
        return res[0] if res else None

    @classmethod
    def create_location(cls, loc_data):
        res = cls.request('POST', 'locations', body=loc_data)
        return res[0] if res else None

    @classmethod
    def delete_location(cls, loc_id):
        return cls.request('DELETE', 'locations', params={'id': f'eq.{loc_id}'})

    # ── SUBMISSIONS ────────────────────────────────────────────
    @classmethod
    def get_submissions(cls, status=None):
        params = {'select': '*', 'order': 'date.desc'}
        if status and status != 'all':
            params['status'] = f'eq.{status}'
        return cls.request('GET', 'submissions', params) or []

    @classmethod
    def get_submission_by_id(cls, sub_id):
        res = cls.request('GET', 'submissions', {'id': f'eq.{sub_id}', 'select': '*'})
        return res[0] if res else None

    @classmethod
    def create_submission(cls, sub_data):
        res = cls.request('POST', 'submissions', body=sub_data)
        return res[0] if res else None

    @classmethod
    def update_submission(cls, sub_id, update_data):
        res = cls.request('PATCH', 'submissions', params={'id': f'eq.{sub_id}'}, body=update_data)
        return res[0] if res else None

    # ── STATS ──────────────────────────────────────────────────
    @classmethod
    def get_stats(cls):
        try:
            locs = cls.request('GET', 'locations', {'select': 'id', 'status': 'eq.approved'}) or []
            total_locations = len(locs)
        except Exception:
            total_locations = 0

        try:
            pending_subs = cls.request('GET', 'submissions', {'select': 'id', 'status': 'eq.pending'}) or []
            pending_submissions = len(pending_subs)
        except Exception:
            pending_submissions = 0

        try:
            rej_subs = cls.request('GET', 'submissions', {'select': 'id', 'status': 'eq.rejected'}) or []
            rejected_submissions = len(rej_subs)
        except Exception:
            rejected_submissions = 0

        try:
            users = cls.request('GET', 'users', {'select': 'id,status'}) or []
            registered_stalkers = len(users)
            pending_users = len([u for u in users if u.get('status') == 'pending'])
        except Exception:
            registered_stalkers = 0
            pending_users = 0

        return {
            'total_locations': total_locations,
            'pending_submissions': pending_submissions,
            'rejected_submissions': rejected_submissions,
            'registered_stalkers': registered_stalkers,
            'pending_users': pending_users
        }
