/* ============================================================
   Supabase client — expuesto como window.sb
   Misma instancia de proyecto que usa uniamos-crm (datos compartidos).
   ============================================================ */

const SUPABASE_URL = 'https://llleoqfeluptmmbqluab.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsbGVvcWZlbHVwdG1tYnFsdWFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNTAzODMsImV4cCI6MjA5MTkyNjM4M30.DQ_iD6xcb0kxr3ZyOl2c_eRhpR9RIcRmBi7tYVjNf5U';

const { createClient } = window.supabase;
window.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
