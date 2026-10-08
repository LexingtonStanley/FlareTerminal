// Placeholder for an empty database. Replace by running `npm run db:types` once
// your Supabase project has tables; queries against unknown tables then fail typecheck.
export type Database = {
  public: {
    Tables: { [_ in never]: never };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
