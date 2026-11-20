
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
            "announcements": {
                  Row: {
                    "body": string,"body_local": string | null,"created_at": string,"created_by": string,"expires_at": string | null,"id": string,"is_pinned": boolean,"published_at": string | null,"status": Database["public"]['Enums']["announcement_status"],"title": string,"title_local": string | null,"updated_at": string,"updated_by": string | null,"village_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"body_local"?: string | null,"created_at"?: string,"created_by": string,"expires_at"?: string | null,"id"?: string,"is_pinned"?: boolean,"published_at"?: string | null,"status"?: Database["public"]['Enums']["announcement_status"],"title": string,"title_local"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"village_id": string
                  }
                  Update: {
                    "body"?: string,"body_local"?: string | null,"created_at"?: string,"created_by"?: string,"expires_at"?: string | null,"id"?: string,"is_pinned"?: boolean,"published_at"?: string | null,"status"?: Database["public"]['Enums']["announcement_status"],"title"?: string,"title_local"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"village_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcements_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcements_village_id_fkey"
      columns: ["village_id"]
isOneToOne: false
      referencedRelation: "villages"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_role_key": string | null,"actor_user_id": string | null,"after": Json | null,"before": Json | null,"entity_id": string | null,"entity_type": string,"id": number,"metadata": NonNullable<Json>,"occurred_at": string,"village_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_role_key"?: string | null,"actor_user_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"entity_id"?: string | null,"entity_type": string,"id"?: never,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"village_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_role_key"?: string | null,"actor_user_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"village_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_logs_village_id_fkey"
      columns: ["village_id"]
isOneToOne: false
      referencedRelation: "villages"
      referencedColumns: ["id"]
    }
                  ]
                },"departments": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"name_local": string | null,"updated_at": string,"village_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"name_local"?: string | null,"updated_at"?: string,"village_id": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"name_local"?: string | null,"updated_at"?: string,"village_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "departments_village_id_fkey"
      columns: ["village_id"]
isOneToOne: false
      referencedRelation: "villages"
      referencedColumns: ["id"]
    }
                  ]
                },"issue_assignments": {
                  Row: {
                    "assigned_at": string,"assigned_by": string,"assignee_user_id": string | null,"department_id": string,"due_at": string | null,"ended_at": string | null,"id": string,"issue_id": string,"note": string | null,"responded_at": string | null,"response_note": string | null,"status": Database["public"]['Enums']["assignment_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"assigned_by": string,"assignee_user_id"?: string | null,"department_id": string,"due_at"?: string | null,"ended_at"?: string | null,"id"?: string,"issue_id": string,"note"?: string | null,"responded_at"?: string | null,"response_note"?: string | null,"status"?: Database["public"]['Enums']["assignment_status"]
                  }
                  Update: {
                    "assigned_at"?: string,"assigned_by"?: string,"assignee_user_id"?: string | null,"department_id"?: string,"due_at"?: string | null,"ended_at"?: string | null,"id"?: string,"issue_id"?: string,"note"?: string | null,"responded_at"?: string | null,"response_note"?: string | null,"status"?: Database["public"]['Enums']["assignment_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "issue_assignments_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_assignments_assignee_user_id_fkey"
      columns: ["assignee_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_assignments_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_assignments_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_assignments_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues_view"
      referencedColumns: ["id"]
    }
                  ]
                },"issue_attachments": {
                  Row: {
                    "created_at": string,"height": number | null,"hidden_at": string | null,"hidden_by": string | null,"hidden_reason": string | null,"id": string,"is_hidden": boolean,"issue_id": string,"kind": Database["public"]['Enums']["attachment_kind"],"mime_type": string,"size_bytes": number,"status_at_upload": Database["public"]['Enums']["issue_status"],"storage_path": string,"uploaded_by": string,"visibility": Database["public"]['Enums']["content_visibility"],"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"height"?: number | null,"hidden_at"?: string | null,"hidden_by"?: string | null,"hidden_reason"?: string | null,"id"?: string,"is_hidden"?: boolean,"issue_id": string,"kind": Database["public"]['Enums']["attachment_kind"],"mime_type": string,"size_bytes": number,"status_at_upload": Database["public"]['Enums']["issue_status"],"storage_path": string,"uploaded_by": string,"visibility"?: Database["public"]['Enums']["content_visibility"],"width"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"height"?: number | null,"hidden_at"?: string | null,"hidden_by"?: string | null,"hidden_reason"?: string | null,"id"?: string,"is_hidden"?: boolean,"issue_id"?: string,"kind"?: Database["public"]['Enums']["attachment_kind"],"mime_type"?: string,"size_bytes"?: number,"status_at_upload"?: Database["public"]['Enums']["issue_status"],"storage_path"?: string,"uploaded_by"?: string,"visibility"?: Database["public"]['Enums']["content_visibility"],"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "issue_attachments_hidden_by_fkey"
      columns: ["hidden_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_attachments_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_attachments_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_attachments_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"issue_categories": {
                  Row: {
                    "created_at": string,"default_priority": Database["public"]['Enums']["issue_priority"] | null,"icon": string | null,"id": string,"is_active": boolean,"key": string,"name": string,"name_local": string | null,"photo_required": boolean,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_priority"?: Database["public"]['Enums']["issue_priority"] | null,"icon"?: string | null,"id"?: string,"is_active"?: boolean,"key": string,"name": string,"name_local"?: string | null,"photo_required"?: boolean,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_priority"?: Database["public"]['Enums']["issue_priority"] | null,"icon"?: string | null,"id"?: string,"is_active"?: boolean,"key"?: string,"name"?: string,"name_local"?: string | null,"photo_required"?: boolean,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"issue_comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"hidden_at": string | null,"hidden_by": string | null,"hidden_reason": string | null,"id": string,"is_hidden": boolean,"issue_id": string,"visibility": Database["public"]['Enums']["content_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"hidden_at"?: string | null,"hidden_by"?: string | null,"hidden_reason"?: string | null,"id"?: string,"is_hidden"?: boolean,"issue_id": string,"visibility"?: Database["public"]['Enums']["content_visibility"]
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"hidden_at"?: string | null,"hidden_by"?: string | null,"hidden_reason"?: string | null,"id"?: string,"is_hidden"?: boolean,"issue_id"?: string,"visibility"?: Database["public"]['Enums']["content_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "issue_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_comments_hidden_by_fkey"
      columns: ["hidden_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_comments_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_comments_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues_view"
      referencedColumns: ["id"]
    }
                  ]
                },"issue_number_counters": {
                  Row: {
                    "last_value": number,"village_id": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "last_value"?: number,"village_id": string,"year": number
                  }
                  Update: {
                    "last_value"?: number,"village_id"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "issue_number_counters_village_id_fkey"
      columns: ["village_id"]
isOneToOne: false
      referencedRelation: "villages"
      referencedColumns: ["id"]
    }
                  ]
                },"issue_status_history": {
                  Row: {
                    "actor_role_key": string | null,"actor_user_id": string | null,"created_at": string,"from_status": Database["public"]['Enums']["issue_status"] | null,"id": number,"issue_id": string,"metadata": NonNullable<Json>,"reason": string | null,"source": Database["public"]['Enums']["action_source"],"to_status": Database["public"]['Enums']["issue_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_role_key"?: string | null,"actor_user_id"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["issue_status"] | null,"id"?: never,"issue_id": string,"metadata"?: NonNullable<Json>,"reason"?: string | null,"source": Database["public"]['Enums']["action_source"],"to_status": Database["public"]['Enums']["issue_status"]
                  }
                  Update: {
                    "actor_role_key"?: string | null,"actor_user_id"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["issue_status"] | null,"id"?: never,"issue_id"?: string,"metadata"?: NonNullable<Json>,"reason"?: string | null,"source"?: Database["public"]['Enums']["action_source"],"to_status"?: Database["public"]['Enums']["issue_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "issue_status_history_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_status_history_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_status_history_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues_view"
      referencedColumns: ["id"]
    }
                  ]
                },"issue_supporters": {
                  Row: {
                    "created_at": string,"issue_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"issue_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"issue_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "issue_supporters_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_supporters_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_supporters_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"issues": {
                  Row: {
                    "assigned_at": string | null,"assigned_department_id": string | null,"assigned_user_id": string | null,"category_id": string,"client_request_id": string,"closed_at": string | null,"created_at": string,"created_by": string,"description": string | null,"duplicate_of_issue_id": string | null,"id": string,"issue_number": string,"last_status_change_at": string,"latitude": number | null,"location_accuracy_m": number | null,"location_text": string | null,"longitude": number | null,"priority": Database["public"]['Enums']["issue_priority"],"rejected_at": string | null,"reopen_count": number,"resolved_at": string | null,"reviewed_at": string | null,"status": Database["public"]['Enums']["issue_status"],"supporter_count": number,"title": string,"updated_at": string,"verified_at": string | null,"version": number,"village_id": string,"visibility": Database["public"]['Enums']["issue_visibility"],"work_started_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string | null,"assigned_department_id"?: string | null,"assigned_user_id"?: string | null,"category_id": string,"client_request_id": string,"closed_at"?: string | null,"created_at"?: string,"created_by": string,"description"?: string | null,"duplicate_of_issue_id"?: string | null,"id"?: string,"issue_number": string,"last_status_change_at"?: string,"latitude"?: number | null,"location_accuracy_m"?: number | null,"location_text"?: string | null,"longitude"?: number | null,"priority"?: Database["public"]['Enums']["issue_priority"],"rejected_at"?: string | null,"reopen_count"?: number,"resolved_at"?: string | null,"reviewed_at"?: string | null,"status"?: Database["public"]['Enums']["issue_status"],"supporter_count"?: number,"title": string,"updated_at"?: string,"verified_at"?: string | null,"version"?: number,"village_id": string,"visibility"?: Database["public"]['Enums']["issue_visibility"],"work_started_at"?: string | null
                  }
                  Update: {
                    "assigned_at"?: string | null,"assigned_department_id"?: string | null,"assigned_user_id"?: string | null,"category_id"?: string,"client_request_id"?: string,"closed_at"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string | null,"duplicate_of_issue_id"?: string | null,"id"?: string,"issue_number"?: string,"last_status_change_at"?: string,"latitude"?: number | null,"location_accuracy_m"?: number | null,"location_text"?: string | null,"longitude"?: number | null,"priority"?: Database["public"]['Enums']["issue_priority"],"rejected_at"?: string | null,"reopen_count"?: number,"resolved_at"?: string | null,"reviewed_at"?: string | null,"status"?: Database["public"]['Enums']["issue_status"],"supporter_count"?: number,"title"?: string,"updated_at"?: string,"verified_at"?: string | null,"version"?: number,"village_id"?: string,"visibility"?: Database["public"]['Enums']["issue_visibility"],"work_started_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "issues_assigned_department_id_fkey"
      columns: ["assigned_department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issues_assigned_user_id_fkey"
      columns: ["assigned_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issues_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "issue_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issues_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issues_duplicate_of_issue_id_fkey"
      columns: ["duplicate_of_issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issues_duplicate_of_issue_id_fkey"
      columns: ["duplicate_of_issue_id"]
isOneToOne: false
      referencedRelation: "issues_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issues_village_id_fkey"
      columns: ["village_id"]
isOneToOne: false
      referencedRelation: "villages"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"created_at": string,"data": NonNullable<Json>,"id": string,"issue_id": string | null,"push_attempts": number,"push_error": string | null,"push_status": Database["public"]['Enums']["push_status"],"read_at": string | null,"recipient_id": string,"title": string,"type": string,"village_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"issue_id"?: string | null,"push_attempts"?: number,"push_error"?: string | null,"push_status"?: Database["public"]['Enums']["push_status"],"read_at"?: string | null,"recipient_id": string,"title": string,"type": string,"village_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"issue_id"?: string | null,"push_attempts"?: number,"push_error"?: string | null,"push_status"?: Database["public"]['Enums']["push_status"],"read_at"?: string | null,"recipient_id"?: string,"title"?: string,"type"?: string,"village_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_village_id_fkey"
      columns: ["village_id"]
isOneToOne: false
      referencedRelation: "villages"
      referencedColumns: ["id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "category": string,"citizen_grantable": boolean,"description": string,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"citizen_grantable"?: boolean,"description": string,"key": string
                  }
                  Update: {
                    "category"?: string,"citizen_grantable"?: boolean,"description"?: string,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_tokens": {
                  Row: {
                    "app_version": string | null,"created_at": string,"expo_push_token": string,"id": string,"last_seen_at": string,"platform": string,"revoked_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_version"?: string | null,"created_at"?: string,"expo_push_token": string,"id"?: string,"last_seen_at"?: string,"platform": string,"revoked_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "app_version"?: string | null,"created_at"?: string,"expo_push_token"?: string,"id"?: string,"last_seen_at"?: string,"platform"?: string,"revoked_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "permission_key": string,"role_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "permission_key": string,"role_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "permission_key"?: string,"role_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_permissions_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_system": boolean,"key": string,"name": string,"requires_mfa": boolean,"scope": Database["public"]['Enums']["role_scope"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_system"?: boolean,"key": string,"name": string,"requires_mfa"?: boolean,"scope"?: Database["public"]['Enums']["role_scope"]
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_system"?: boolean,"key"?: string,"name"?: string,"requires_mfa"?: boolean,"scope"?: Database["public"]['Enums']["role_scope"]
                  }
                  Relationships: [
                    
                  ]
                },"user_roles": {
                  Row: {
                    "department_id": string | null,"granted_at": string,"granted_by": string | null,"id": string,"revoke_reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"role_id": string,"user_id": string,"village_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "department_id"?: string | null,"granted_at"?: string,"granted_by"?: string | null,"id"?: string,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"role_id": string,"user_id": string,"village_id"?: string | null
                  }
                  Update: {
                    "department_id"?: string | null,"granted_at"?: string,"granted_by"?: string | null,"id"?: string,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"role_id"?: string,"user_id"?: string,"village_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_village_id_fkey"
      columns: ["village_id"]
isOneToOne: false
      referencedRelation: "villages"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "avatar_path": string | null,"created_at": string,"deleted_at": string | null,"display_name": string | null,"full_name": string,"home_village_id": string | null,"id": string,"preferred_language": string,"status": Database["public"]['Enums']["user_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"display_name"?: string | null,"full_name": string,"home_village_id"?: string | null,"id": string,"preferred_language"?: string,"status"?: Database["public"]['Enums']["user_status"],"updated_at"?: string
                  }
                  Update: {
                    "avatar_path"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"display_name"?: string | null,"full_name"?: string,"home_village_id"?: string | null,"id"?: string,"preferred_language"?: string,"status"?: Database["public"]['Enums']["user_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "users_home_village_id_fkey"
      columns: ["home_village_id"]
isOneToOne: false
      referencedRelation: "villages"
      referencedColumns: ["id"]
    }
                  ]
                },"villages": {
                  Row: {
                    "center_lat": number | null,"center_lng": number | null,"code": string,"created_at": string,"district": string | null,"id": string,"is_active": boolean,"mandal": string | null,"name": string,"name_local": string | null,"settings": NonNullable<Json>,"state": string | null,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "center_lat"?: number | null,"center_lng"?: number | null,"code": string,"created_at"?: string,"district"?: string | null,"id"?: string,"is_active"?: boolean,"mandal"?: string | null,"name": string,"name_local"?: string | null,"settings"?: NonNullable<Json>,"state"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "center_lat"?: number | null,"center_lng"?: number | null,"code"?: string,"created_at"?: string,"district"?: string | null,"id"?: string,"is_active"?: boolean,"mandal"?: string | null,"name"?: string,"name_local"?: string | null,"settings"?: NonNullable<Json>,"state"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "issue_attachments_view": {
                  Row: {
                    "created_at": string,"height": number | null,"id": string,"is_hidden": boolean,"is_mine": boolean | null,"issue_id": string,"kind": Database["public"]['Enums']["attachment_kind"],"mime_type": string,"size_bytes": number,"status_at_upload": Database["public"]['Enums']["issue_status"],"storage_path": string,"uploaded_by_name": string | null,"uploaded_by_role_key": string | null,"visibility": Database["public"]['Enums']["content_visibility"],"width": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "issue_attachments_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_attachments_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues_view"
      referencedColumns: ["id"]
    }
                  ]
                },"issue_comments_view": {
                  Row: {
                    "author_name": string | null,"author_role_key": string | null,"body": string | null,"created_at": string,"hidden_reason": string | null,"id": string,"is_hidden": boolean,"is_mine": boolean | null,"issue_id": string,"visibility": Database["public"]['Enums']["content_visibility"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "issue_comments_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issue_comments_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "issues_view"
      referencedColumns: ["id"]
    }
                  ]
                },"issue_timeline_view": {
                  Row: {
                    "actor_name": string | null,"actor_role_key": string | null,"event_type": string | null,"from_status": Database["public"]['Enums']["issue_status"] | null,"is_mine": boolean | null,"is_system": boolean | null,"issue_id": string | null,"metadata": Json | null,"occurred_at": string | null,"reason": string | null,"source_id": string | null,"to_status": Database["public"]['Enums']["issue_status"] | null,"visibility": Database["public"]['Enums']["content_visibility"] | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"issues_view": {
                  Row: {
                    "assigned_at": string | null,"assigned_department_id": string | null,"assigned_department_name": string | null,"assigned_user_id": string | null,"assigned_user_name": string | null,"category_id": string,"category_key": string,"category_name": string,"category_name_local": string | null,"closed_at": string | null,"created_at": string,"description": string | null,"duplicate_of_issue_id": string | null,"i_am_assignee": boolean | null,"i_support": boolean | null,"id": string,"is_mine": boolean | null,"issue_number": string,"last_status_change_at": string,"latitude": number | null,"location_accuracy_m": number | null,"location_text": string | null,"longitude": number | null,"priority": Database["public"]['Enums']["issue_priority"],"rejected_at": string | null,"reopen_count": number,"reporter_id": string | null,"reporter_name": string | null,"resolved_at": string | null,"reviewed_at": string | null,"status": Database["public"]['Enums']["issue_status"],"supporter_count": number,"title": string,"updated_at": string,"verified_at": string | null,"version": number,"village_id": string,"visibility": Database["public"]['Enums']["issue_visibility"],"work_started_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "issues_assigned_department_id_fkey"
      columns: ["assigned_department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issues_assigned_user_id_fkey"
      columns: ["assigned_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issues_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "issue_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issues_duplicate_of_issue_id_fkey"
      columns: ["duplicate_of_issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issues_duplicate_of_issue_id_fkey"
      columns: ["duplicate_of_issue_id"]
isOneToOne: false
      referencedRelation: "issues_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issues_village_id_fkey"
      columns: ["village_id"]
isOneToOne: false
      referencedRelation: "villages"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_assignment":
{ Args: { "p_issue_id": string }; Returns: undefined
                           },
"add_comment":
{ Args: { "p_body": string,"p_issue_id": string,"p_visibility"?: Database["public"]['Enums']["content_visibility"] }; Returns: string
                           },
"add_issue_photos":
{ Args: { "p_attachments": Json,"p_issue_id": string,"p_kind": Database["public"]['Enums']["attachment_kind"],"p_visibility"?: Database["public"]['Enums']["content_visibility"] }; Returns: number
                           },
"add_progress_update":
{ Args: { "p_attachments"?: Json,"p_issue_id": string,"p_note"?: string }; Returns: undefined
                           },
"admin_get_user_contact":
{ Args: { "p_issue_id"?: string,"p_user_id": string }; Returns: string
                           },
"admin_list_departments":
{ Args: { "p_village_id": string }; Returns: {
              "description": string,"id": string,"is_active": boolean,"name": string,"name_local": string,"open_issue_count": number,"worker_count": number
            }[]
                           },
"admin_list_users":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_role_key"?: string,"p_search"?: string,"p_village_id": string }; Returns: {
              "created_at": string,"display_name": string,"full_name": string,"id": string,"roles": Json,"status": Database["public"]['Enums']["user_status"]
            }[]
                           },
"admin_list_workers":
{ Args: { "p_department_id"?: string,"p_village_id": string }; Returns: {
              "completed_assignments": number,"department_id": string,"department_name": string,"display_name": string,"full_name": string,"granted_at": string,"open_assignments": number,"user_id": string,"user_role_id": string,"user_status": Database["public"]['Enums']["user_status"]
            }[]
                           },
"assign_issue":
{ Args: { "p_assignee_user_id"?: string,"p_department_id": string,"p_due_at"?: string,"p_expected_version": number,"p_issue_id": string,"p_note"?: string,"p_reason"?: string,"p_source"?: string }; Returns: number
                           },
"change_home_village":
{ Args: { "p_village_id": string }; Returns: undefined
                           },
"close_issue":
{ Args: { "p_expected_version": number,"p_issue_id": string,"p_reason": string,"p_source"?: string }; Returns: number
                           },
"complete_profile":
{ Args: { "p_display_name"?: string,"p_full_name": string,"p_home_village_id": string,"p_preferred_language"?: string }; Returns: undefined
                           },
"confirm_resolution":
{ Args: { "p_attachments"?: Json,"p_expected_version": number,"p_issue_id": string,"p_reason"?: string,"p_solved": boolean,"p_source"?: string }; Returns: number
                           },
"create_issue":
{ Args: { "p_attachments"?: Json,"p_category_id": string,"p_client_request_id": string,"p_description"?: string,"p_latitude"?: number,"p_location_accuracy_m"?: number,"p_location_text"?: string,"p_longitude"?: number,"p_source"?: string,"p_title": string,"p_village_id": string,"p_visibility"?: Database["public"]['Enums']["issue_visibility"] }; Returns: Json
                           },
"dashboard_stats":
{ Args: { "p_from"?: string,"p_to"?: string,"p_village_id": string }; Returns: Json
                           },
"decline_assignment":
{ Args: { "p_expected_version": number,"p_issue_id": string,"p_reason": string,"p_source"?: string }; Returns: number
                           },
"edit_my_issue":
{ Args: { "p_description"?: string,"p_expected_version": number,"p_issue_id": string,"p_location_text"?: string,"p_title": string }; Returns: undefined
                           },
"find_similar_issues":
{ Args: { "p_category_id": string,"p_latitude": number,"p_longitude": number,"p_radius_m"?: number,"p_village_id": string }; Returns: {
              "created_at": string,"distance_m": number,"i_support": boolean,"id": string,"issue_number": string,"status": Database["public"]['Enums']["issue_status"],"supporter_count": number,"title": string
            }[]
                           },
"get_my_permissions":
{ Args: { "p_village_id": string }; Returns: (string)[]
                           },
"get_my_profile":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_my_roles":
{ Args: Record<PropertyKey, never>; Returns: {
              "active_now": boolean,"department_id": string,"requires_mfa": boolean,"role_key": string,"village_id": string,"village_name": string
            }[]
                           },
"grant_role":
{ Args: { "p_department_id"?: string,"p_reason"?: string,"p_role_key": string,"p_user_id": string,"p_village_id"?: string }; Returns: string
                           },
"hide_attachment":
{ Args: { "p_attachment_id": string,"p_reason": string }; Returns: undefined
                           },
"hide_comment":
{ Args: { "p_comment_id": string,"p_reason": string }; Returns: undefined
                           },
"issues_by_category":
{ Args: { "p_from"?: string,"p_to"?: string,"p_village_id": string }; Returns: {
              "category_id": string,"category_key": string,"category_name": string,"closed": number,"open": number,"total": number
            }[]
                           },
"issues_by_department":
{ Args: { "p_from"?: string,"p_to"?: string,"p_village_id": string }; Returns: {
              "avg_resolution_hours": number,"closed": number,"department_id": string,"department_name": string,"open": number,"total": number
            }[]
                           },
"mark_all_notifications_read":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"mark_duplicate":
{ Args: { "p_duplicate_of": string,"p_expected_version": number,"p_issue_id": string,"p_note"?: string,"p_source"?: string }; Returns: number
                           },
"reconsider_issue":
{ Args: { "p_expected_version": number,"p_issue_id": string,"p_reason": string,"p_source"?: string }; Returns: number
                           },
"register_push_token":
{ Args: { "p_app_version"?: string,"p_platform": string,"p_token": string }; Returns: undefined
                           },
"reject_issue":
{ Args: { "p_expected_version": number,"p_issue_id": string,"p_reason": string,"p_source"?: string }; Returns: number
                           },
"reopen_issue":
{ Args: { "p_expected_version": number,"p_issue_id": string,"p_reason": string,"p_source"?: string }; Returns: number
                           },
"resolve_issue":
{ Args: { "p_attachments"?: Json,"p_expected_version": number,"p_issue_id": string,"p_note"?: string,"p_source"?: string }; Returns: number
                           },
"revoke_push_token":
{ Args: { "p_token": string }; Returns: undefined
                           },
"revoke_role":
{ Args: { "p_reason": string,"p_user_role_id": string }; Returns: undefined
                           },
"service_ensure_profile":
{ Args: { "p_full_name": string,"p_user_id": string,"p_village_id": string }; Returns: undefined
                           },
"service_find_user_by_phone":
{ Args: { "p_phone": string }; Returns: string
                           },
"set_department_active":
{ Args: { "p_active": boolean,"p_department_id": string }; Returns: undefined
                           },
"set_issue_priority":
{ Args: { "p_expected_version": number,"p_issue_id": string,"p_priority": Database["public"]['Enums']["issue_priority"] }; Returns: number
                           },
"set_issue_visibility":
{ Args: { "p_expected_version": number,"p_issue_id": string,"p_visibility": Database["public"]['Enums']["issue_visibility"] }; Returns: number
                           },
"set_user_status":
{ Args: { "p_reason": string,"p_status": Database["public"]['Enums']["user_status"],"p_user_id": string }; Returns: undefined
                           },
"start_review":
{ Args: { "p_expected_version": number,"p_issue_id": string,"p_source"?: string }; Returns: number
                           },
"start_work":
{ Args: { "p_expected_version": number,"p_issue_id": string,"p_source"?: string }; Returns: number
                           },
"support_issue":
{ Args: { "p_issue_id": string }; Returns: number
                           },
"unsupport_issue":
{ Args: { "p_issue_id": string }; Returns: number
                           },
"upsert_department":
{ Args: { "p_description"?: string,"p_id"?: string,"p_name": string,"p_name_local"?: string,"p_village_id": string }; Returns: string
                           },
"verify_issue":
{ Args: { "p_expected_version": number,"p_issue_id": string,"p_note"?: string,"p_priority"?: Database["public"]['Enums']["issue_priority"],"p_source"?: string }; Returns: number
                           }
          }
          Enums: {
            "action_source": "MOBILE"|"ADMIN_WEB"|"SYSTEM","announcement_status": "DRAFT"|"PUBLISHED"|"ARCHIVED","assignment_status": "PENDING"|"ACCEPTED"|"DECLINED"|"SUPERSEDED"|"COMPLETED","attachment_kind": "INITIAL_EVIDENCE"|"PROGRESS"|"COMPLETION"|"OTHER","content_visibility": "PUBLIC"|"INTERNAL","issue_priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL","issue_status": "SUBMITTED"|"UNDER_REVIEW"|"VERIFIED"|"ASSIGNED"|"IN_PROGRESS"|"RESOLVED"|"CLOSED"|"REJECTED"|"REOPENED"|"DUPLICATE","issue_visibility": "PUBLIC"|"PRIVATE","push_status": "PENDING"|"SENT"|"FAILED"|"SKIPPED","role_scope": "VILLAGE"|"GLOBAL","user_status": "ACTIVE"|"SUSPENDED"|"DELETED"
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
            "action_source": ["MOBILE", "ADMIN_WEB", "SYSTEM"],"announcement_status": ["DRAFT", "PUBLISHED", "ARCHIVED"],"assignment_status": ["PENDING", "ACCEPTED", "DECLINED", "SUPERSEDED", "COMPLETED"],"attachment_kind": ["INITIAL_EVIDENCE", "PROGRESS", "COMPLETION", "OTHER"],"content_visibility": ["PUBLIC", "INTERNAL"],"issue_priority": ["LOW", "MEDIUM", "HIGH", "CRITICAL"],"issue_status": ["SUBMITTED", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED", "REOPENED", "DUPLICATE"],"issue_visibility": ["PUBLIC", "PRIVATE"],"push_status": ["PENDING", "SENT", "FAILED", "SKIPPED"],"role_scope": ["VILLAGE", "GLOBAL"],"user_status": ["ACTIVE", "SUSPENDED", "DELETED"]
          }
        }
} as const
