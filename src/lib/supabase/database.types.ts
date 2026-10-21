
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "balance_carryovers": {
                  Row: {
                    "days": number,"employee_id": string,"leave_type": string,"school_year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "days": number,"employee_id": string,"leave_type": string,"school_year": number
                  }
                  Update: {
                    "days"?: number,"employee_id"?: string,"leave_type"?: string,"school_year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "balance_carryovers_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"divisions": {
                  Row: {
                    "code": string,"id": number,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"id"?: never,"name": string
                  }
                  Update: {
                    "code"?: string,"id"?: never,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"leave_record_events": {
                  Row: {
                    "action": string,"actor_id": string | null,"comment": string | null,"created_at": string,"id": number,"record_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"comment"?: string | null,"created_at"?: string,"id"?: never,"record_id": number
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"comment"?: string | null,"created_at"?: string,"id"?: never,"record_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_record_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_record_events_record_id_fkey"
      columns: ["record_id"]
isOneToOne: false
      referencedRelation: "leave_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_record_events_record_id_fkey"
      columns: ["record_id"]
isOneToOne: false
      referencedRelation: "my_leave_records"
      referencedColumns: ["id"]
    }
                  ]
                },"leave_records": {
                  Row: {
                    "created_at": string,"date": string,"employee_comment": string | null,"employee_id": string,"end_min": number,"id": number,"leave_type": string,"manager_comment": string | null,"minutes": number,"paid_days": number | null,"position_id": number,"relationship": string | null,"request_id": number,"start_min": number,"status": string,"unpaid_days": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date": string,"employee_comment"?: string | null,"employee_id": string,"end_min": number,"id"?: never,"leave_type": string,"manager_comment"?: string | null,"minutes": number,"paid_days"?: number | null,"position_id": number,"relationship"?: string | null,"request_id": number,"start_min": number,"status"?: string,"unpaid_days"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"date"?: string,"employee_comment"?: string | null,"employee_id"?: string,"end_min"?: number,"id"?: never,"leave_type"?: string,"manager_comment"?: string | null,"minutes"?: number,"paid_days"?: number | null,"position_id"?: number,"relationship"?: string | null,"request_id"?: number,"start_min"?: number,"status"?: string,"unpaid_days"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_records_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_records_position_id_fkey"
      columns: ["position_id"]
isOneToOne: false
      referencedRelation: "positions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_records_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "leave_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"leave_requests": {
                  Row: {
                    "created_at": string,"employee_comment": string | null,"employee_id": string,"id": number,"leave_type": string,"relationship": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"employee_comment"?: string | null,"employee_id": string,"id"?: never,"leave_type": string,"relationship"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"employee_comment"?: string | null,"employee_id"?: string,"id"?: never,"leave_type"?: string,"relationship"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_requests_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"position_managers": {
                  Row: {
                    "manager_id": string,"position_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "manager_id": string,"position_id": number
                  }
                  Update: {
                    "manager_id"?: string,"position_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "position_managers_manager_id_fkey"
      columns: ["manager_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "position_managers_position_id_fkey"
      columns: ["position_id"]
isOneToOne: false
      referencedRelation: "positions"
      referencedColumns: ["id"]
    }
                  ]
                },"positions": {
                  Row: {
                    "division_id": number,"employee_id": string,"id": number,"kind": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "division_id": number,"employee_id": string,"id"?: never,"kind": string,"title": string
                  }
                  Update: {
                    "division_id"?: number,"employee_id"?: string,"id"?: never,"kind"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "positions_division_id_fkey"
      columns: ["division_id"]
isOneToOne: false
      referencedRelation: "divisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "positions_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string | null,"id": string,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id": string,"role"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id"?: string,"role"?: string
                  }
                  Relationships: [
                    
                  ]
                },"schedule_blocks": {
                  Row: {
                    "employee_id": string,"end_min": number,"id": number,"position_id": number,"start_min": number,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "employee_id": string,"end_min": number,"id"?: never,"position_id": number,"start_min": number,"weekday": number
                  }
                  Update: {
                    "employee_id"?: string,"end_min"?: number,"id"?: never,"position_id"?: number,"start_min"?: number,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_blocks_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_blocks_position_id_fkey"
      columns: ["position_id"]
isOneToOne: false
      referencedRelation: "positions"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "my_leave_records": {
                  Row: {
                    "created_at": string | null,"date": string | null,"division_name": string | null,"employee_comment": string | null,"end_min": number | null,"id": number | null,"leave_type": string | null,"manager_comment": string | null,"minutes": number | null,"paid_days": number | null,"position_id": number | null,"position_kind": string | null,"position_title": string | null,"relationship": string | null,"request_id": number | null,"start_min": number | null,"status": string | null,"unpaid_days": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "leave_records_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "leave_requests"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "balance_employees":
{ Args: never; Returns: { "email": string,"full_name": string,"id": string }[]
                           }
            "cancel_leave_record":
{ Args: { "p_record_id": number }; Returns: undefined
                           }
            "decide_leave_record":
{ Args: { "p_comment"?: string,"p_decision": string,"p_record_id": number,"p_split"?: boolean }; Returns: Json
                           }
            "decision_balance":
{ Args: { "p_record_id": number }; Returns: Json
                           }
            "decision_records":
{ Args: never; Returns: { "can_decide": boolean,"created_at": string,"date": string,"decided_at": string,"decided_by_name": string,"division_name": string,"employee_comment": string,"employee_email": string,"employee_id": string,"employee_name": string,"end_min": number,"id": number,"leave_type": string,"manager_comment": string,"minutes": number,"paid_days": number,"position_kind": string,"position_title": string,"relationship": string,"request_id": number,"start_min": number,"status": string,"unpaid_days": number }[]
                           }
            "get_balance_inputs":
{ Args: { "p_employee_id": string,"p_school_year": number }; Returns: Json
                           }
            "record_histories":
{ Args: { "p_record_ids": number[] }; Returns: { "action": string,"actor_name": string,"comment": string,"created_at": string,"record_id": number }[]
                           }
            "record_history":
{ Args: { "p_record_id": number }; Returns: { "action": string,"actor_name": string,"comment": string,"created_at": string }[]
                           }
            "resubmit_leave_record":
{ Args: { "p_record_id": number }; Returns: undefined
                           }
            "submit_leave_request":
{ Args: { "p_comment"?: string,"p_leave_type": string,"p_records": Json,"p_relationship"?: string }; Returns: number
                           }
            "update_leave_record_hours":
{ Args: { "p_end_min": number,"p_record_id": number,"p_start_min": number }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
