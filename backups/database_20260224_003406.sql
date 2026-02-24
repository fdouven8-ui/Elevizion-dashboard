--
-- PostgreSQL database dump
--

\restrict 8M9xfekjtl3XMmpEs0DpmWWE6cBY0wq7fzg68bESetBhhfkIneVYBvl9js9xHi7

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.yodeck_media_links DROP CONSTRAINT IF EXISTS yodeck_media_links_placement_id_fkey;
ALTER TABLE IF EXISTS ONLY public.yodeck_media_links DROP CONSTRAINT IF EXISTS yodeck_media_links_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.yodeck_creatives DROP CONSTRAINT IF EXISTS yodeck_creatives_suggested_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.yodeck_creatives DROP CONSTRAINT IF EXISTS yodeck_creatives_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.webhook_deliveries DROP CONSTRAINT IF EXISTS webhook_deliveries_webhook_id_webhooks_id_fk;
ALTER TABLE IF EXISTS ONLY public.upload_jobs DROP CONSTRAINT IF EXISTS upload_jobs_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.upload_jobs DROP CONSTRAINT IF EXISTS upload_jobs_ad_asset_id_fkey;
ALTER TABLE IF EXISTS ONLY public.templates DROP CONSTRAINT IF EXISTS templates_last_edited_by_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.templates DROP CONSTRAINT IF EXISTS templates_created_by_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.template_versions DROP CONSTRAINT IF EXISTS template_versions_template_id_templates_id_fk;
ALTER TABLE IF EXISTS ONLY public.template_versions DROP CONSTRAINT IF EXISTS template_versions_edited_by_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_survey_id_location_surveys_id_fk;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_location_id_locations_id_fk;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_lead_id_leads_id_fk;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_contract_id_contracts_id_fk;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_advertiser_id_advertisers_id_fk;
ALTER TABLE IF EXISTS ONLY public.task_attachments DROP CONSTRAINT IF EXISTS task_attachments_task_id_tasks_id_fk;
ALTER TABLE IF EXISTS ONLY public.sync_jobs DROP CONSTRAINT IF EXISTS sync_jobs_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.survey_supplies DROP CONSTRAINT IF EXISTS survey_supplies_survey_id_location_surveys_id_fk;
ALTER TABLE IF EXISTS ONLY public.survey_supplies DROP CONSTRAINT IF EXISTS survey_supplies_supply_item_id_supply_items_id_fk;
ALTER TABLE IF EXISTS ONLY public.survey_photos DROP CONSTRAINT IF EXISTS survey_photos_survey_id_location_surveys_id_fk;
ALTER TABLE IF EXISTS ONLY public.snapshot_placements DROP CONSTRAINT IF EXISTS snapshot_placements_snapshot_id_schedule_snapshots_id_fk;
ALTER TABLE IF EXISTS ONLY public.snapshot_placements DROP CONSTRAINT IF EXISTS snapshot_placements_screen_id_screens_id_fk;
ALTER TABLE IF EXISTS ONLY public.snapshot_placements DROP CONSTRAINT IF EXISTS snapshot_placements_placement_id_placements_id_fk;
ALTER TABLE IF EXISTS ONLY public.snapshot_placements DROP CONSTRAINT IF EXISTS snapshot_placements_location_id_locations_id_fk;
ALTER TABLE IF EXISTS ONLY public.snapshot_placements DROP CONSTRAINT IF EXISTS snapshot_placements_contract_id_contracts_id_fk;
ALTER TABLE IF EXISTS ONLY public.snapshot_placements DROP CONSTRAINT IF EXISTS snapshot_placements_advertiser_id_advertisers_id_fk;
ALTER TABLE IF EXISTS ONLY public.site_yodeck_snapshot DROP CONSTRAINT IF EXISTS site_yodeck_snapshot_site_id_fkey;
ALTER TABLE IF EXISTS ONLY public.site_contact_snapshot DROP CONSTRAINT IF EXISTS site_contact_snapshot_site_id_fkey;
ALTER TABLE IF EXISTS ONLY public.screens DROP CONSTRAINT IF EXISTS screens_location_id_locations_id_fk;
ALTER TABLE IF EXISTS ONLY public.screens DROP CONSTRAINT IF EXISTS screens_location_group_id_fkey;
ALTER TABLE IF EXISTS ONLY public.screens DROP CONSTRAINT IF EXISTS screens_group_id_screen_groups_id_fk;
ALTER TABLE IF EXISTS ONLY public.screen_content_items DROP CONSTRAINT IF EXISTS screen_content_items_screen_id_fkey;
ALTER TABLE IF EXISTS ONLY public.screen_content_items DROP CONSTRAINT IF EXISTS screen_content_items_linked_placement_id_fkey;
ALTER TABLE IF EXISTS ONLY public.screen_content_items DROP CONSTRAINT IF EXISTS screen_content_items_linked_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales_activities DROP CONSTRAINT IF EXISTS sales_activities_lead_id_leads_id_fk;
ALTER TABLE IF EXISTS ONLY public.revenue_allocations DROP CONSTRAINT IF EXISTS revenue_allocations_screen_id_fkey;
ALTER TABLE IF EXISTS ONLY public.revenue_allocations DROP CONSTRAINT IF EXISTS revenue_allocations_location_id_fkey;
ALTER TABLE IF EXISTS ONLY public.revenue_allocations DROP CONSTRAINT IF EXISTS revenue_allocations_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.reports DROP CONSTRAINT IF EXISTS reports_advertiser_id_advertisers_id_fk;
ALTER TABLE IF EXISTS ONLY public.report_metrics DROP CONSTRAINT IF EXISTS report_metrics_screen_id_screens_id_fk;
ALTER TABLE IF EXISTS ONLY public.report_metrics DROP CONSTRAINT IF EXISTS report_metrics_report_id_reports_id_fk;
ALTER TABLE IF EXISTS ONLY public.report_metrics DROP CONSTRAINT IF EXISTS report_metrics_location_id_locations_id_fk;
ALTER TABLE IF EXISTS ONLY public.report_logs DROP CONSTRAINT IF EXISTS report_logs_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.portal_users DROP CONSTRAINT IF EXISTS portal_users_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.portal_user_screen_selections DROP CONSTRAINT IF EXISTS portal_user_screen_selections_screen_id_fkey;
ALTER TABLE IF EXISTS ONLY public.portal_user_screen_selections DROP CONSTRAINT IF EXISTS portal_user_screen_selections_portal_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.portal_tokens DROP CONSTRAINT IF EXISTS portal_tokens_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.portal_placements DROP CONSTRAINT IF EXISTS portal_placements_screen_id_fkey;
ALTER TABLE IF EXISTS ONLY public.portal_placements DROP CONSTRAINT IF EXISTS portal_placements_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.placements DROP CONSTRAINT IF EXISTS placements_screen_id_screens_id_fk;
ALTER TABLE IF EXISTS ONLY public.placements DROP CONSTRAINT IF EXISTS placements_contract_id_contracts_id_fk;
ALTER TABLE IF EXISTS ONLY public.placement_targets DROP CONSTRAINT IF EXISTS placement_targets_plan_id_fkey;
ALTER TABLE IF EXISTS ONLY public.placement_targets DROP CONSTRAINT IF EXISTS placement_targets_location_id_fkey;
ALTER TABLE IF EXISTS ONLY public.placement_plans DROP CONSTRAINT IF EXISTS placement_plans_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.placement_plans DROP CONSTRAINT IF EXISTS placement_plans_ad_asset_id_fkey;
ALTER TABLE IF EXISTS ONLY public.payouts DROP CONSTRAINT IF EXISTS payouts_snapshot_id_schedule_snapshots_id_fk;
ALTER TABLE IF EXISTS ONLY public.payouts DROP CONSTRAINT IF EXISTS payouts_location_id_locations_id_fk;
ALTER TABLE IF EXISTS ONLY public.payments DROP CONSTRAINT IF EXISTS payments_invoice_id_invoices_id_fk;
ALTER TABLE IF EXISTS ONLY public.onboarding_tasks DROP CONSTRAINT IF EXISTS onboarding_tasks_checklist_id_onboarding_checklists_id_fk;
ALTER TABLE IF EXISTS ONLY public.onboarding_checklists DROP CONSTRAINT IF EXISTS onboarding_checklists_advertiser_id_advertisers_id_fk;
ALTER TABLE IF EXISTS ONLY public.moneybird_invoices DROP CONSTRAINT IF EXISTS moneybird_invoices_internal_invoice_id_fkey;
ALTER TABLE IF EXISTS ONLY public.moneybird_contacts DROP CONSTRAINT IF EXISTS moneybird_contacts_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.location_tokens DROP CONSTRAINT IF EXISTS location_tokens_location_id_fkey;
ALTER TABLE IF EXISTS ONLY public.location_surveys DROP CONSTRAINT IF EXISTS location_surveys_location_id_locations_id_fk;
ALTER TABLE IF EXISTS ONLY public.location_surveys DROP CONSTRAINT IF EXISTS location_surveys_lead_id_leads_id_fk;
ALTER TABLE IF EXISTS ONLY public.location_payouts DROP CONSTRAINT IF EXISTS location_payouts_location_id_fkey;
ALTER TABLE IF EXISTS ONLY public.location_onboarding_events DROP CONSTRAINT IF EXISTS location_onboarding_events_location_id_fkey;
ALTER TABLE IF EXISTS ONLY public.job_runs DROP CONSTRAINT IF EXISTS job_runs_job_id_jobs_id_fk;
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS invoices_snapshot_id_schedule_snapshots_id_fk;
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS invoices_contract_id_contracts_id_fk;
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS invoices_advertiser_id_advertisers_id_fk;
ALTER TABLE IF EXISTS ONLY public.incidents DROP CONSTRAINT IF EXISTS incidents_screen_id_screens_id_fk;
ALTER TABLE IF EXISTS ONLY public.incidents DROP CONSTRAINT IF EXISTS incidents_location_id_locations_id_fk;
ALTER TABLE IF EXISTS ONLY public.creatives DROP CONSTRAINT IF EXISTS creatives_advertiser_id_advertisers_id_fk;
ALTER TABLE IF EXISTS ONLY public.creative_versions DROP CONSTRAINT IF EXISTS creative_versions_creative_id_creatives_id_fk;
ALTER TABLE IF EXISTS ONLY public.creative_approvals DROP CONSTRAINT IF EXISTS creative_approvals_creative_id_creatives_id_fk;
ALTER TABLE IF EXISTS ONLY public.contracts DROP CONSTRAINT IF EXISTS contracts_package_plan_id_package_plans_id_fk;
ALTER TABLE IF EXISTS ONLY public.contracts DROP CONSTRAINT IF EXISTS contracts_advertiser_id_advertisers_id_fk;
ALTER TABLE IF EXISTS ONLY public.contract_files DROP CONSTRAINT IF EXISTS contract_files_contract_id_contracts_id_fk;
ALTER TABLE IF EXISTS ONLY public.contract_events DROP CONSTRAINT IF EXISTS contract_events_contract_id_contracts_id_fk;
ALTER TABLE IF EXISTS ONLY public.claim_prefills DROP CONSTRAINT IF EXISTS claim_prefills_waitlist_request_id_fkey;
ALTER TABLE IF EXISTS ONLY public.carry_overs DROP CONSTRAINT IF EXISTS carry_overs_to_payout_id_payouts_id_fk;
ALTER TABLE IF EXISTS ONLY public.carry_overs DROP CONSTRAINT IF EXISTS carry_overs_location_id_locations_id_fk;
ALTER TABLE IF EXISTS ONLY public.carry_overs DROP CONSTRAINT IF EXISTS carry_overs_from_payout_id_payouts_id_fk;
ALTER TABLE IF EXISTS ONLY public.advertisers DROP CONSTRAINT IF EXISTS advertisers_plan_id_fk;
ALTER TABLE IF EXISTS ONLY public.advertiser_accounts DROP CONSTRAINT IF EXISTS advertiser_accounts_advertiser_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ad_assets DROP CONSTRAINT IF EXISTS ad_assets_advertiser_id_fkey;
DROP INDEX IF EXISTS public.screen_content_items_screen_media_idx;
DROP INDEX IF EXISTS public.report_logs_advertiser_period_idx;
DROP INDEX IF EXISTS public.portal_user_screen_idx;
DROP INDEX IF EXISTS public.portal_placements_advertiser_screen_idx;
DROP INDEX IF EXISTS public.idx_yodeck_creatives_category;
DROP INDEX IF EXISTS public.idx_yodeck_creatives_advertiser;
DROP INDEX IF EXISTS public.idx_portal_tokens_advertiser;
DROP INDEX IF EXISTS public."IDX_session_expire";
ALTER TABLE IF EXISTS ONLY public.yodeck_screens_cache DROP CONSTRAINT IF EXISTS yodeck_screens_cache_pkey;
ALTER TABLE IF EXISTS ONLY public.yodeck_media_links DROP CONSTRAINT IF EXISTS yodeck_media_links_yodeck_media_id_key;
ALTER TABLE IF EXISTS ONLY public.yodeck_media_links DROP CONSTRAINT IF EXISTS yodeck_media_links_pkey;
ALTER TABLE IF EXISTS ONLY public.yodeck_creatives DROP CONSTRAINT IF EXISTS yodeck_creatives_yodeck_media_id_key;
ALTER TABLE IF EXISTS ONLY public.yodeck_creatives DROP CONSTRAINT IF EXISTS yodeck_creatives_pkey;
ALTER TABLE IF EXISTS ONLY public.webhooks DROP CONSTRAINT IF EXISTS webhooks_pkey;
ALTER TABLE IF EXISTS ONLY public.webhook_deliveries DROP CONSTRAINT IF EXISTS webhook_deliveries_pkey;
ALTER TABLE IF EXISTS ONLY public.waitlist_requests DROP CONSTRAINT IF EXISTS waitlist_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.verification_codes DROP CONSTRAINT IF EXISTS verification_codes_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_unique;
ALTER TABLE IF EXISTS ONLY public.upload_jobs DROP CONSTRAINT IF EXISTS upload_jobs_pkey;
ALTER TABLE IF EXISTS ONLY public.terms_acceptance DROP CONSTRAINT IF EXISTS terms_acceptance_pkey;
ALTER TABLE IF EXISTS ONLY public.templates DROP CONSTRAINT IF EXISTS templates_pkey;
ALTER TABLE IF EXISTS ONLY public.template_versions DROP CONSTRAINT IF EXISTS template_versions_pkey;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_pkey;
ALTER TABLE IF EXISTS ONLY public.task_attachments DROP CONSTRAINT IF EXISTS task_attachments_pkey;
ALTER TABLE IF EXISTS ONLY public.tag_policies DROP CONSTRAINT IF EXISTS tag_policies_tag_name_key;
ALTER TABLE IF EXISTS ONLY public.tag_policies DROP CONSTRAINT IF EXISTS tag_policies_pkey;
ALTER TABLE IF EXISTS ONLY public.system_settings DROP CONSTRAINT IF EXISTS system_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.system_settings DROP CONSTRAINT IF EXISTS system_settings_key_key;
ALTER TABLE IF EXISTS ONLY public.sync_logs DROP CONSTRAINT IF EXISTS sync_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.sync_jobs DROP CONSTRAINT IF EXISTS sync_jobs_pkey;
ALTER TABLE IF EXISTS ONLY public.survey_supplies DROP CONSTRAINT IF EXISTS survey_supplies_pkey;
ALTER TABLE IF EXISTS ONLY public.survey_photos DROP CONSTRAINT IF EXISTS survey_photos_pkey;
ALTER TABLE IF EXISTS ONLY public.supply_items DROP CONSTRAINT IF EXISTS supply_items_pkey;
ALTER TABLE IF EXISTS ONLY public.snapshot_placements DROP CONSTRAINT IF EXISTS snapshot_placements_pkey;
ALTER TABLE IF EXISTS ONLY public.sites DROP CONSTRAINT IF EXISTS sites_yodeck_screen_id_key;
ALTER TABLE IF EXISTS ONLY public.sites DROP CONSTRAINT IF EXISTS sites_pkey;
ALTER TABLE IF EXISTS ONLY public.sites DROP CONSTRAINT IF EXISTS sites_code_key;
ALTER TABLE IF EXISTS ONLY public.site_yodeck_snapshot DROP CONSTRAINT IF EXISTS site_yodeck_snapshot_pkey;
ALTER TABLE IF EXISTS ONLY public.site_contact_snapshot DROP CONSTRAINT IF EXISTS site_contact_snapshot_pkey;
ALTER TABLE IF EXISTS ONLY public.sessions DROP CONSTRAINT IF EXISTS sessions_pkey;
ALTER TABLE IF EXISTS ONLY public.screens DROP CONSTRAINT IF EXISTS screens_yodeck_uuid_key;
ALTER TABLE IF EXISTS ONLY public.screens DROP CONSTRAINT IF EXISTS screens_screen_id_unique;
ALTER TABLE IF EXISTS ONLY public.screens DROP CONSTRAINT IF EXISTS screens_pkey;
ALTER TABLE IF EXISTS ONLY public.screen_leads DROP CONSTRAINT IF EXISTS screen_leads_pkey;
ALTER TABLE IF EXISTS ONLY public.screen_groups DROP CONSTRAINT IF EXISTS screen_groups_pkey;
ALTER TABLE IF EXISTS ONLY public.screen_content_items DROP CONSTRAINT IF EXISTS screen_content_items_pkey;
ALTER TABLE IF EXISTS ONLY public.schedule_snapshots DROP CONSTRAINT IF EXISTS schedule_snapshots_pkey;
ALTER TABLE IF EXISTS ONLY public.sales_activities DROP CONSTRAINT IF EXISTS sales_activities_pkey;
ALTER TABLE IF EXISTS ONLY public.revenue_allocations DROP CONSTRAINT IF EXISTS revenue_allocations_pkey;
ALTER TABLE IF EXISTS ONLY public.reports DROP CONSTRAINT IF EXISTS reports_pkey;
ALTER TABLE IF EXISTS ONLY public.report_metrics DROP CONSTRAINT IF EXISTS report_metrics_pkey;
ALTER TABLE IF EXISTS ONLY public.report_logs DROP CONSTRAINT IF EXISTS report_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.portal_users DROP CONSTRAINT IF EXISTS portal_users_pkey;
ALTER TABLE IF EXISTS ONLY public.portal_users DROP CONSTRAINT IF EXISTS portal_users_email_key;
ALTER TABLE IF EXISTS ONLY public.portal_user_screen_selections DROP CONSTRAINT IF EXISTS portal_user_screen_selections_pkey;
ALTER TABLE IF EXISTS ONLY public.portal_tokens DROP CONSTRAINT IF EXISTS portal_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.portal_placements DROP CONSTRAINT IF EXISTS portal_placements_pkey;
ALTER TABLE IF EXISTS ONLY public.plans DROP CONSTRAINT IF EXISTS plans_pkey;
ALTER TABLE IF EXISTS ONLY public.plans DROP CONSTRAINT IF EXISTS plans_code_key;
ALTER TABLE IF EXISTS ONLY public.placements DROP CONSTRAINT IF EXISTS placements_pkey;
ALTER TABLE IF EXISTS ONLY public.placement_targets DROP CONSTRAINT IF EXISTS placement_targets_pkey;
ALTER TABLE IF EXISTS ONLY public.placement_plans DROP CONSTRAINT IF EXISTS placement_plans_pkey;
ALTER TABLE IF EXISTS ONLY public.placement_plans DROP CONSTRAINT IF EXISTS placement_plans_idempotency_key_key;
ALTER TABLE IF EXISTS ONLY public.payouts DROP CONSTRAINT IF EXISTS payouts_pkey;
ALTER TABLE IF EXISTS ONLY public.payments DROP CONSTRAINT IF EXISTS payments_pkey;
ALTER TABLE IF EXISTS ONLY public.package_plans DROP CONSTRAINT IF EXISTS package_plans_pkey;
ALTER TABLE IF EXISTS ONLY public.onboarding_tasks DROP CONSTRAINT IF EXISTS onboarding_tasks_pkey;
ALTER TABLE IF EXISTS ONLY public.onboarding_invite_tokens DROP CONSTRAINT IF EXISTS onboarding_invite_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.onboarding_checklists DROP CONSTRAINT IF EXISTS onboarding_checklists_pkey;
ALTER TABLE IF EXISTS ONLY public.monthly_reports DROP CONSTRAINT IF EXISTS monthly_reports_pkey;
ALTER TABLE IF EXISTS ONLY public.moneybird_payments DROP CONSTRAINT IF EXISTS moneybird_payments_pkey;
ALTER TABLE IF EXISTS ONLY public.moneybird_payments DROP CONSTRAINT IF EXISTS moneybird_payments_moneybird_id_key;
ALTER TABLE IF EXISTS ONLY public.moneybird_invoices DROP CONSTRAINT IF EXISTS moneybird_invoices_pkey;
ALTER TABLE IF EXISTS ONLY public.moneybird_invoices DROP CONSTRAINT IF EXISTS moneybird_invoices_moneybird_id_key;
ALTER TABLE IF EXISTS ONLY public.moneybird_contacts DROP CONSTRAINT IF EXISTS moneybird_contacts_pkey;
ALTER TABLE IF EXISTS ONLY public.moneybird_contacts DROP CONSTRAINT IF EXISTS moneybird_contacts_moneybird_id_key;
ALTER TABLE IF EXISTS ONLY public.moneybird_contacts_cache DROP CONSTRAINT IF EXISTS moneybird_contacts_cache_pkey;
ALTER TABLE IF EXISTS ONLY public.locations DROP CONSTRAINT IF EXISTS locations_pkey;
ALTER TABLE IF EXISTS ONLY public.locations DROP CONSTRAINT IF EXISTS locations_moneybird_contact_id_key;
ALTER TABLE IF EXISTS ONLY public.locations DROP CONSTRAINT IF EXISTS locations_location_key_key;
ALTER TABLE IF EXISTS ONLY public.locations DROP CONSTRAINT IF EXISTS locations_location_code_key;
ALTER TABLE IF EXISTS ONLY public.locations DROP CONSTRAINT IF EXISTS locations_intake_token_key;
ALTER TABLE IF EXISTS ONLY public.locations DROP CONSTRAINT IF EXISTS locations_contract_token_key;
ALTER TABLE IF EXISTS ONLY public.location_tokens DROP CONSTRAINT IF EXISTS location_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.location_surveys DROP CONSTRAINT IF EXISTS location_surveys_pkey;
ALTER TABLE IF EXISTS ONLY public.location_payouts DROP CONSTRAINT IF EXISTS location_payouts_pkey;
ALTER TABLE IF EXISTS ONLY public.location_onboarding_events DROP CONSTRAINT IF EXISTS location_onboarding_events_pkey;
ALTER TABLE IF EXISTS ONLY public.location_groups DROP CONSTRAINT IF EXISTS location_groups_pkey;
ALTER TABLE IF EXISTS ONLY public.leads DROP CONSTRAINT IF EXISTS leads_pkey;
ALTER TABLE IF EXISTS ONLY public.jobs DROP CONSTRAINT IF EXISTS jobs_pkey;
ALTER TABLE IF EXISTS ONLY public.jobs DROP CONSTRAINT IF EXISTS jobs_name_unique;
ALTER TABLE IF EXISTS ONLY public.job_runs DROP CONSTRAINT IF EXISTS job_runs_pkey;
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS invoices_pkey;
ALTER TABLE IF EXISTS ONLY public.integration_outbox DROP CONSTRAINT IF EXISTS integration_outbox_pkey;
ALTER TABLE IF EXISTS ONLY public.integration_outbox DROP CONSTRAINT IF EXISTS integration_outbox_idempotency_key_key;
ALTER TABLE IF EXISTS ONLY public.integration_logs DROP CONSTRAINT IF EXISTS integration_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.integration_configs DROP CONSTRAINT IF EXISTS integration_configs_service_key;
ALTER TABLE IF EXISTS ONLY public.integration_configs DROP CONSTRAINT IF EXISTS integration_configs_pkey;
ALTER TABLE IF EXISTS ONLY public.incidents DROP CONSTRAINT IF EXISTS incidents_pkey;
ALTER TABLE IF EXISTS ONLY public.entities DROP CONSTRAINT IF EXISTS entities_yodeck_device_id_key;
ALTER TABLE IF EXISTS ONLY public.entities DROP CONSTRAINT IF EXISTS entities_pkey;
ALTER TABLE IF EXISTS ONLY public.entities DROP CONSTRAINT IF EXISTS entities_moneybird_contact_id_key;
ALTER TABLE IF EXISTS ONLY public.entities DROP CONSTRAINT IF EXISTS entities_entity_code_key;
ALTER TABLE IF EXISTS ONLY public.email_logs DROP CONSTRAINT IF EXISTS email_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.e2e_test_runs DROP CONSTRAINT IF EXISTS e2e_test_runs_pkey;
ALTER TABLE IF EXISTS ONLY public.digital_signatures DROP CONSTRAINT IF EXISTS digital_signatures_pkey;
ALTER TABLE IF EXISTS ONLY public.creatives DROP CONSTRAINT IF EXISTS creatives_pkey;
ALTER TABLE IF EXISTS ONLY public.creative_versions DROP CONSTRAINT IF EXISTS creative_versions_pkey;
ALTER TABLE IF EXISTS ONLY public.creative_approvals DROP CONSTRAINT IF EXISTS creative_approvals_pkey;
ALTER TABLE IF EXISTS ONLY public.contracts DROP CONSTRAINT IF EXISTS contracts_pkey;
ALTER TABLE IF EXISTS ONLY public.contract_files DROP CONSTRAINT IF EXISTS contract_files_pkey;
ALTER TABLE IF EXISTS ONLY public.contract_events DROP CONSTRAINT IF EXISTS contract_events_pkey;
ALTER TABLE IF EXISTS ONLY public.contract_documents DROP CONSTRAINT IF EXISTS contract_documents_pkey;
ALTER TABLE IF EXISTS ONLY public.contact_roles DROP CONSTRAINT IF EXISTS contact_roles_pk;
ALTER TABLE IF EXISTS ONLY public.company_profile DROP CONSTRAINT IF EXISTS company_profile_pkey;
ALTER TABLE IF EXISTS ONLY public.claim_prefills DROP CONSTRAINT IF EXISTS claim_prefills_pkey;
ALTER TABLE IF EXISTS ONLY public.carry_overs DROP CONSTRAINT IF EXISTS carry_overs_pkey;
ALTER TABLE IF EXISTS ONLY public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.alert_rules DROP CONSTRAINT IF EXISTS alert_rules_pkey;
ALTER TABLE IF EXISTS ONLY public.advertisers DROP CONSTRAINT IF EXISTS advertisers_pkey;
ALTER TABLE IF EXISTS ONLY public.advertisers DROP CONSTRAINT IF EXISTS advertisers_link_key_key;
ALTER TABLE IF EXISTS ONLY public.advertiser_leads DROP CONSTRAINT IF EXISTS advertiser_leads_pkey;
ALTER TABLE IF EXISTS ONLY public.advertiser_accounts DROP CONSTRAINT IF EXISTS advertiser_accounts_pkey;
ALTER TABLE IF EXISTS ONLY public.advertiser_accounts DROP CONSTRAINT IF EXISTS advertiser_accounts_email_key;
ALTER TABLE IF EXISTS ONLY public.advertiser_accounts DROP CONSTRAINT IF EXISTS advertiser_accounts_advertiser_id_key;
ALTER TABLE IF EXISTS ONLY public.ad_assets DROP CONSTRAINT IF EXISTS ad_assets_pkey;
DROP TABLE IF EXISTS public.yodeck_screens_cache;
DROP TABLE IF EXISTS public.yodeck_media_links;
DROP TABLE IF EXISTS public.yodeck_creatives;
DROP TABLE IF EXISTS public.webhooks;
DROP TABLE IF EXISTS public.webhook_deliveries;
DROP TABLE IF EXISTS public.waitlist_requests;
DROP TABLE IF EXISTS public.verification_codes;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.upload_jobs;
DROP TABLE IF EXISTS public.terms_acceptance;
DROP TABLE IF EXISTS public.templates;
DROP TABLE IF EXISTS public.template_versions;
DROP TABLE IF EXISTS public.tasks;
DROP TABLE IF EXISTS public.task_attachments;
DROP TABLE IF EXISTS public.tag_policies;
DROP TABLE IF EXISTS public.system_settings;
DROP TABLE IF EXISTS public.sync_logs;
DROP TABLE IF EXISTS public.sync_jobs;
DROP TABLE IF EXISTS public.survey_supplies;
DROP TABLE IF EXISTS public.survey_photos;
DROP TABLE IF EXISTS public.supply_items;
DROP TABLE IF EXISTS public.snapshot_placements;
DROP TABLE IF EXISTS public.sites;
DROP TABLE IF EXISTS public.site_yodeck_snapshot;
DROP TABLE IF EXISTS public.site_contact_snapshot;
DROP TABLE IF EXISTS public.sessions;
DROP TABLE IF EXISTS public.screens;
DROP TABLE IF EXISTS public.screen_leads;
DROP TABLE IF EXISTS public.screen_groups;
DROP TABLE IF EXISTS public.screen_content_items;
DROP TABLE IF EXISTS public.schedule_snapshots;
DROP TABLE IF EXISTS public.sales_activities;
DROP TABLE IF EXISTS public.revenue_allocations;
DROP TABLE IF EXISTS public.reports;
DROP TABLE IF EXISTS public.report_metrics;
DROP TABLE IF EXISTS public.report_logs;
DROP TABLE IF EXISTS public.portal_users;
DROP TABLE IF EXISTS public.portal_user_screen_selections;
DROP TABLE IF EXISTS public.portal_tokens;
DROP TABLE IF EXISTS public.portal_placements;
DROP TABLE IF EXISTS public.plans;
DROP TABLE IF EXISTS public.placements;
DROP TABLE IF EXISTS public.placement_targets;
DROP TABLE IF EXISTS public.placement_plans;
DROP TABLE IF EXISTS public.payouts;
DROP TABLE IF EXISTS public.payments;
DROP TABLE IF EXISTS public.package_plans;
DROP TABLE IF EXISTS public.onboarding_tasks;
DROP TABLE IF EXISTS public.onboarding_invite_tokens;
DROP TABLE IF EXISTS public.onboarding_checklists;
DROP TABLE IF EXISTS public.monthly_reports;
DROP TABLE IF EXISTS public.moneybird_payments;
DROP TABLE IF EXISTS public.moneybird_invoices;
DROP TABLE IF EXISTS public.moneybird_contacts_cache;
DROP TABLE IF EXISTS public.moneybird_contacts;
DROP TABLE IF EXISTS public.locations;
DROP TABLE IF EXISTS public.location_tokens;
DROP TABLE IF EXISTS public.location_surveys;
DROP TABLE IF EXISTS public.location_payouts;
DROP TABLE IF EXISTS public.location_onboarding_events;
DROP TABLE IF EXISTS public.location_groups;
DROP TABLE IF EXISTS public.leads;
DROP TABLE IF EXISTS public.jobs;
DROP TABLE IF EXISTS public.job_runs;
DROP TABLE IF EXISTS public.invoices;
DROP TABLE IF EXISTS public.integration_outbox;
DROP TABLE IF EXISTS public.integration_logs;
DROP TABLE IF EXISTS public.integration_configs;
DROP TABLE IF EXISTS public.incidents;
DROP TABLE IF EXISTS public.entities;
DROP TABLE IF EXISTS public.email_logs;
DROP TABLE IF EXISTS public.e2e_test_runs;
DROP TABLE IF EXISTS public.digital_signatures;
DROP TABLE IF EXISTS public.creatives;
DROP TABLE IF EXISTS public.creative_versions;
DROP TABLE IF EXISTS public.creative_approvals;
DROP TABLE IF EXISTS public.contracts;
DROP TABLE IF EXISTS public.contract_files;
DROP TABLE IF EXISTS public.contract_events;
DROP TABLE IF EXISTS public.contract_documents;
DROP TABLE IF EXISTS public.contact_roles;
DROP TABLE IF EXISTS public.company_profile;
DROP TABLE IF EXISTS public.claim_prefills;
DROP TABLE IF EXISTS public.carry_overs;
DROP TABLE IF EXISTS public.audit_logs;
DROP TABLE IF EXISTS public.alert_rules;
DROP TABLE IF EXISTS public.advertisers;
DROP TABLE IF EXISTS public.advertiser_leads;
DROP TABLE IF EXISTS public.advertiser_accounts;
DROP TABLE IF EXISTS public.ad_assets;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ad_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_assets (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id character varying NOT NULL,
    link_key text NOT NULL,
    original_file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    storage_url text,
    storage_path text,
    duration_seconds numeric(10,2),
    width integer,
    height integer,
    aspect_ratio text,
    codec text,
    validation_status text DEFAULT 'pending'::text NOT NULL,
    validation_errors jsonb DEFAULT '[]'::jsonb,
    validation_warnings jsonb DEFAULT '[]'::jsonb,
    required_duration_seconds integer DEFAULT 15 NOT NULL,
    reviewed_by_admin_at timestamp without time zone,
    reviewed_by_admin_id character varying,
    admin_notes text,
    uploaded_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    stored_filename text,
    approval_status text DEFAULT 'UPLOADED'::text NOT NULL,
    approved_at timestamp without time zone,
    approved_by character varying,
    rejected_at timestamp without time zone,
    rejected_by character varying,
    rejected_reason text,
    rejected_details text,
    pixel_format text,
    conversion_status text DEFAULT 'NONE'::text NOT NULL,
    conversion_started_at timestamp without time zone,
    conversion_completed_at timestamp without time zone,
    conversion_error text,
    converted_storage_path text,
    converted_storage_url text,
    converted_codec text,
    converted_pixel_format text,
    converted_width integer,
    converted_height integer,
    converted_size_bytes integer,
    yodeck_media_id integer,
    yodeck_uploaded_at timestamp without time zone,
    yodeck_readiness_status text DEFAULT 'pending'::text NOT NULL,
    media_metadata jsonb,
    normalization_started_at timestamp without time zone,
    normalization_completed_at timestamp without time zone,
    normalization_error text,
    normalized_url text,
    superseded_by_id text,
    yodeck_reject_reason text,
    yodeck_metadata_json jsonb,
    normalization_provider text,
    normalized_storage_path text,
    normalized_storage_url text,
    is_superseded boolean DEFAULT false NOT NULL,
    publish_status text DEFAULT 'PENDING'::text,
    publish_error text,
    publish_attempts integer DEFAULT 0,
    last_publish_attempt_at timestamp without time zone
);


--
-- Name: advertiser_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advertiser_accounts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id character varying NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: advertiser_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advertiser_leads (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    goal text NOT NULL,
    region text NOT NULL,
    company_name text NOT NULL,
    contact_name text NOT NULL,
    phone text,
    email text,
    budget_indication text,
    remarks text,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    inferred_category text,
    final_category text
);


--
-- Name: advertisers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advertisers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    company_name text NOT NULL,
    contact_name text NOT NULL,
    email text NOT NULL,
    phone text,
    vat_number text,
    address text,
    moneybird_contact_id text,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    iban text,
    iban_account_holder text,
    sepa_mandate boolean DEFAULT false,
    sepa_mandate_reference text,
    sepa_mandate_date date,
    kvk_number text,
    street text,
    zipcode text,
    city text,
    moneybird_contact_snapshot jsonb,
    country text DEFAULT 'NL'::text,
    customer_reference text,
    is_business boolean DEFAULT true,
    website text,
    invoice_email text,
    attention text,
    tags text,
    invoice_delivery_method text DEFAULT 'email'::text,
    language text DEFAULT 'nl'::text,
    payment_term_days integer DEFAULT 14,
    discount_percentage numeric(5,2),
    sepa_bic text,
    moneybird_sync_status text DEFAULT 'pending'::text,
    moneybird_sync_error text,
    onboarding_status text DEFAULT 'draft'::text,
    source text,
    moneybird_last_sync_at timestamp without time zone,
    invite_email_sent_at timestamp without time zone,
    confirmation_email_sent_at timestamp without time zone,
    whatnow_email_sent_at timestamp without time zone,
    link_key text,
    link_key_generated_at timestamp without time zone,
    package_type text,
    screens_included integer,
    package_price numeric(10,2),
    package_notes text,
    asset_status text DEFAULT 'none'::text,
    accepted_terms_at timestamp without time zone,
    accepted_terms_ip text,
    accepted_terms_user_agent text,
    accepted_terms_version text,
    accepted_terms_pdf_url text,
    bundled_pdf_url text,
    bundled_pdf_generated_at timestamp without time zone,
    video_duration_seconds integer DEFAULT 15,
    strict_resolution boolean DEFAULT false,
    target_region_codes text[],
    category text,
    desired_impressions_per_week integer,
    business_category text,
    competitor_group text,
    upload_enabled boolean DEFAULT false,
    last_upload_token_generated_at timestamp without time zone,
    target_cities text,
    yodeck_media_id_canonical integer,
    yodeck_media_id_canonical_updated_at timestamp without time zone,
    publish_error_code text,
    publish_error_message text,
    publish_failed_at timestamp without time zone,
    publish_retry_count integer DEFAULT 0,
    plan_id character varying,
    onboarding_complete boolean DEFAULT false
);


--
-- Name: alert_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_rules (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    alert_type text NOT NULL,
    threshold_minutes integer DEFAULT 30 NOT NULL,
    notify_emails text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id character varying NOT NULL,
    action text NOT NULL,
    actor_type text NOT NULL,
    actor_id character varying,
    changes jsonb,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: carry_overs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carry_overs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    location_id character varying NOT NULL,
    from_payout_id character varying,
    to_payout_id character varying,
    amount numeric(10,2) NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: claim_prefills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claim_prefills (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    waitlist_request_id character varying NOT NULL,
    form_data text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone
);


--
-- Name: company_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_profile (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    legal_name text NOT NULL,
    trade_name text NOT NULL,
    kvk_number text NOT NULL,
    vat_number text NOT NULL,
    address_line1 text,
    postal_code text,
    city text,
    country text DEFAULT 'NL'::text,
    public_address_enabled boolean DEFAULT false,
    email text,
    phone text,
    website text,
    iban text,
    iban_account_holder text,
    bic_code text,
    show_full_address_in_pdf boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_roles (
    moneybird_contact_id text NOT NULL,
    role text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: contract_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_documents (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    template_key text NOT NULL,
    entity_type text NOT NULL,
    entity_id character varying NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    rendered_content text,
    pdf_url text,
    status text DEFAULT 'draft'::text NOT NULL,
    signed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    sign_provider text,
    signrequest_document_id text,
    signrequest_url text,
    sign_status text DEFAULT 'none'::text,
    signed_pdf_url text,
    signed_log_url text,
    sent_at timestamp without time zone
);


--
-- Name: contract_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_events (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    contract_id character varying NOT NULL,
    event_type text NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    actor_type text DEFAULT 'system'::text NOT NULL,
    actor_id character varying,
    actor_name text,
    ip_address text,
    user_agent text
);


--
-- Name: contract_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_files (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    contract_id character varying NOT NULL,
    file_type text NOT NULL,
    file_name text NOT NULL,
    storage_key text NOT NULL,
    mime_type text,
    file_size integer,
    sha256_hash text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id character varying NOT NULL,
    package_plan_id character varying,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date,
    monthly_price_ex_vat numeric(10,2) NOT NULL,
    vat_percent numeric(5,2) DEFAULT 21.00 NOT NULL,
    billing_cycle text DEFAULT 'monthly'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    title text,
    pdf_url text,
    html_content text,
    signature_token_hash text,
    sent_at timestamp without time zone,
    viewed_at timestamp without time zone,
    signed_at timestamp without time zone,
    expires_at timestamp without time zone,
    signed_by_name text,
    signed_by_email text,
    signed_ip text,
    signed_user_agent text,
    signature_data text,
    target_region_codes_override text[],
    target_cities_override text
);


--
-- Name: creative_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creative_approvals (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    creative_id character varying NOT NULL,
    requested_at timestamp without time zone DEFAULT now() NOT NULL,
    approved_at timestamp without time zone,
    rejected_at timestamp without time zone,
    approved_by_user_id character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: creative_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creative_versions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    creative_id character varying NOT NULL,
    version_no integer NOT NULL,
    file_url text NOT NULL,
    file_name text NOT NULL,
    mime_type text,
    file_size integer,
    sha256_hash text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: creatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creatives (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id character varying NOT NULL,
    creative_type text NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    duration_seconds integer,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    phash text,
    phash_updated_at timestamp without time zone
);


--
-- Name: digital_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.digital_signatures (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    document_type text NOT NULL,
    document_id character varying NOT NULL,
    signer_name text NOT NULL,
    signer_email text,
    signer_role text,
    signature_data text,
    signed_at timestamp without time zone DEFAULT now() NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: e2e_test_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.e2e_test_runs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    test_type text DEFAULT 'YODECK_CHAIN'::text NOT NULL,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    ok boolean,
    steps_json jsonb,
    error text,
    test_location_id character varying,
    test_media_id text,
    triggered_by character varying
);


--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    to_email text NOT NULL,
    template_key text NOT NULL,
    entity_type text,
    entity_id character varying,
    status text DEFAULT 'queued'::text NOT NULL,
    provider_message_id text,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    sent_at timestamp without time zone,
    subject_rendered text,
    body_rendered text,
    contact_name text
);


--
-- Name: entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entities (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_code text NOT NULL,
    display_name text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    moneybird_contact_id text,
    yodeck_device_id text,
    tags jsonb DEFAULT '[]'::jsonb,
    contact_data jsonb,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidents (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    incident_type text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    screen_id character varying,
    location_id character varying,
    status text DEFAULT 'open'::text NOT NULL,
    title text NOT NULL,
    description text,
    metadata jsonb,
    opened_at timestamp without time zone DEFAULT now() NOT NULL,
    acknowledged_at timestamp without time zone,
    resolved_at timestamp without time zone,
    last_seen_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    assignee_user_id character varying
);


--
-- Name: integration_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_configs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    service text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    status text DEFAULT 'not_configured'::text NOT NULL,
    last_tested_at timestamp without time zone,
    last_test_result text,
    last_test_error text,
    last_sync_at timestamp without time zone,
    last_sync_items_processed integer,
    sync_frequency text DEFAULT '15min'::text,
    settings jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    encrypted_credentials text,
    credentials_configured jsonb
);


--
-- Name: integration_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    service text NOT NULL,
    action text NOT NULL,
    status text NOT NULL,
    request_data jsonb,
    response_data jsonb,
    error_message text,
    duration_ms integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: integration_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_outbox (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    action_type text NOT NULL,
    entity_type text NOT NULL,
    entity_id character varying NOT NULL,
    payload_json jsonb,
    idempotency_key text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    last_error text,
    external_id text,
    response_json jsonb,
    next_retry_at timestamp without time zone,
    processed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id character varying NOT NULL,
    contract_id character varying,
    snapshot_id character varying,
    invoice_number text,
    period_start date NOT NULL,
    period_end date NOT NULL,
    amount_ex_vat numeric(10,2) NOT NULL,
    vat_amount numeric(10,2) NOT NULL,
    amount_inc_vat numeric(10,2) NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    due_date date,
    paid_at timestamp without time zone,
    moneybird_invoice_id text,
    moneybird_invoice_url text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: job_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_runs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    job_id character varying NOT NULL,
    status text NOT NULL,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    duration_ms integer,
    result_summary jsonb,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    schedule text,
    is_enabled boolean DEFAULT true NOT NULL,
    last_run_at timestamp without time zone,
    last_run_status text,
    last_error_message text,
    next_run_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    company_name text NOT NULL,
    contact_name text NOT NULL,
    email text,
    phone text,
    address text,
    notes text,
    status text DEFAULT 'nieuw'::text NOT NULL,
    source text,
    assigned_to_user_id character varying,
    expected_value numeric(10,2),
    follow_up_date date,
    converted_at timestamp without time zone,
    converted_to_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    city text,
    postcode text,
    kvk_number text,
    inferred_category text,
    inferred_confidence numeric(3,2),
    final_category text,
    category_updated_at timestamp without time zone,
    category text,
    is_handled boolean DEFAULT false NOT NULL,
    handled_at timestamp without time zone,
    handled_by character varying(255),
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp without time zone,
    deleted_by character varying(255)
);


--
-- Name: location_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_groups (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    moneybird_contact_id text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: location_onboarding_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_onboarding_events (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    location_id character varying NOT NULL,
    event_type text NOT NULL,
    event_data jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: location_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_payouts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    location_id character varying NOT NULL,
    allocated_revenue_total numeric(12,2) NOT NULL,
    payout_type text NOT NULL,
    revenue_share_percent numeric(5,2),
    fixed_amount numeric(10,2),
    payout_amount numeric(12,2) NOT NULL,
    minimum_threshold numeric(10,2),
    carried_over boolean DEFAULT false,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_at timestamp without time zone,
    approved_by_user_id character varying,
    paid_at timestamp without time zone,
    payment_reference text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: location_surveys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_surveys (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    lead_id character varying,
    location_id character varying,
    survey_date date NOT NULL,
    survey_by_user_id character varying,
    has_wifi_available boolean,
    wifi_network_name text,
    has_power_outlet boolean,
    power_outlet_location text,
    proposed_screen_count integer DEFAULT 1,
    proposed_screen_locations text,
    wall_mount_possible boolean,
    ceiling_mount_possible boolean,
    stand_mount_possible boolean,
    foot_traffic_estimate text,
    target_audience text,
    competing_screens boolean,
    competing_screens_notes text,
    proposed_revenue_share numeric(5,2),
    installation_notes text,
    estimated_installation_cost numeric(10,2),
    status text DEFAULT 'concept'::text NOT NULL,
    photos jsonb,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    wifi_password_encrypted text
);


--
-- Name: location_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_tokens (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    location_id character varying NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    address text,
    contact_name text,
    email text,
    phone text,
    revenue_share_percent numeric(5,2) DEFAULT 10.00 NOT NULL,
    minimum_payout_amount numeric(10,2) DEFAULT 25.00 NOT NULL,
    bank_account_iban text,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    street text,
    zipcode text,
    city text,
    moneybird_contact_id text,
    is_placeholder boolean DEFAULT false,
    source text DEFAULT 'manual'::text,
    onboarding_status text DEFAULT 'draft'::text,
    moneybird_sync_status text DEFAULT 'not_linked'::text,
    moneybird_sync_error text,
    moneybird_last_sync_at timestamp without time zone,
    location_code text,
    house_number text,
    visitors_per_week integer,
    opening_hours text,
    branche text,
    pi_status text DEFAULT 'not_installed'::text,
    yodeck_device_id text,
    yodeck_status text DEFAULT 'not_linked'::text,
    invite_email_sent_at timestamp without time zone,
    reminder_email_sent_at timestamp without time zone,
    payout_type text DEFAULT 'revshare'::text NOT NULL,
    fixed_payout_amount numeric(10,2),
    last_reminder_sent_at timestamp without time zone,
    location_key text,
    country text DEFAULT 'Nederland'::text,
    location_type text,
    bank_account_name text,
    intake_token text,
    intake_token_expires_at timestamp without time zone,
    intake_token_used_at timestamp without time zone,
    contract_token text,
    contract_token_expires_at timestamp without time zone,
    contract_token_used_at timestamp without time zone,
    reviewed_at timestamp without time zone,
    reviewed_by text,
    review_decision text,
    accepted_terms_at timestamp without time zone,
    accepted_terms_ip text,
    accepted_terms_user_agent text,
    accepted_terms_version text,
    accepted_terms_pdf_url text,
    contract_instance_id text,
    intake_confirmation_sent_at timestamp without time zone,
    contract_email_sent_at timestamp without time zone,
    completion_email_sent_at timestamp without time zone,
    bundled_pdf_url text,
    bundled_pdf_generated_at timestamp without time zone,
    region_code text,
    categories_allowed text[],
    audience_category text,
    avg_visitors_per_week integer,
    ad_slot_capacity_seconds_per_loop integer DEFAULT 120,
    current_ad_load_seconds integer DEFAULT 0,
    loop_duration_seconds integer DEFAULT 300,
    yodeck_playlist_id text,
    last_sync_at timestamp without time zone,
    exclusivity_mode text DEFAULT 'STRICT'::text NOT NULL,
    needs_review boolean DEFAULT false,
    needs_review_reason text,
    ready_for_ads boolean DEFAULT false NOT NULL,
    paused_by_admin boolean DEFAULT false NOT NULL,
    playlist_mode character varying(20) DEFAULT 'TAG_BASED'::character varying NOT NULL,
    playlist_tag text,
    yodeck_playlist_verified_at timestamp with time zone,
    yodeck_playlist_verify_status character varying(20) DEFAULT 'UNKNOWN'::character varying NOT NULL,
    last_yodeck_verify_error text,
    yodeck_layout_id text,
    yodeck_baseline_playlist_id text,
    layout_mode text DEFAULT 'FALLBACK_SCHEDULE'::text NOT NULL,
    combined_playlist_id text,
    combined_playlist_verified_at timestamp without time zone,
    combined_playlist_item_count integer DEFAULT 0
);


--
-- Name: moneybird_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moneybird_contacts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    moneybird_id text NOT NULL,
    company_name text,
    firstname text,
    lastname text,
    email text,
    phone text,
    address1 text,
    address2 text,
    zipcode text,
    city text,
    country text,
    chamber_of_commerce text,
    tax_number text,
    sepa_active boolean DEFAULT false,
    sepa_iban text,
    sepa_iban_account_name text,
    sepa_mandate_id text,
    sepa_mandate_date date,
    customer_id text,
    advertiser_id character varying,
    last_synced_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: moneybird_contacts_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moneybird_contacts_cache (
    moneybird_contact_id text NOT NULL,
    company_name text,
    contact_name text,
    email text,
    phone text,
    address jsonb,
    raw jsonb,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: moneybird_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moneybird_invoices (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    moneybird_id text NOT NULL,
    moneybird_contact_id text NOT NULL,
    invoice_id text,
    reference text,
    invoice_date date,
    due_date date,
    state text,
    total_price_excl_tax numeric(12,2),
    total_price_incl_tax numeric(12,2),
    total_unpaid numeric(12,2),
    currency text DEFAULT 'EUR'::text,
    paid_at timestamp without time zone,
    url text,
    internal_invoice_id character varying,
    last_synced_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: moneybird_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moneybird_payments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    moneybird_id text NOT NULL,
    moneybird_invoice_id text NOT NULL,
    payment_date date,
    price numeric(12,2),
    price_currency text DEFAULT 'EUR'::text,
    last_synced_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: monthly_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monthly_reports (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    report_type text NOT NULL,
    entity_id character varying NOT NULL,
    entity_name text,
    report_data jsonb,
    status text DEFAULT 'draft'::text NOT NULL,
    generated_at timestamp without time zone,
    sent_at timestamp without time zone,
    sent_to_email text,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: onboarding_checklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_checklists (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id character varying NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: onboarding_invite_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_invite_tokens (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    entity_type text NOT NULL,
    entity_id character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: onboarding_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_tasks (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    checklist_id character varying NOT NULL,
    task_type text NOT NULL,
    status text DEFAULT 'todo'::text NOT NULL,
    owner_user_id character varying,
    notes text,
    due_date date,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: package_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_plans (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    base_monthly_price_ex_vat numeric(10,2) NOT NULL,
    default_seconds_per_loop integer DEFAULT 10 NOT NULL,
    default_plays_per_hour integer DEFAULT 6 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    invoice_id character varying NOT NULL,
    amount numeric(10,2) NOT NULL,
    payment_date date NOT NULL,
    payment_method text,
    moneybird_payment_id text,
    reference text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payouts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    location_id character varying NOT NULL,
    snapshot_id character varying,
    period_start date NOT NULL,
    period_end date NOT NULL,
    gross_revenue_ex_vat numeric(10,2) NOT NULL,
    share_percent numeric(5,2) NOT NULL,
    payout_amount_ex_vat numeric(10,2) NOT NULL,
    carry_over_from_previous numeric(10,2) DEFAULT 0.00,
    total_due numeric(10,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp without time zone,
    payment_reference text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: placement_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.placement_plans (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id character varying NOT NULL,
    ad_asset_id character varying NOT NULL,
    link_key text NOT NULL,
    status text DEFAULT 'PROPOSED'::text NOT NULL,
    package_type text NOT NULL,
    required_target_count integer NOT NULL,
    proposed_targets jsonb,
    approved_targets jsonb,
    simulation_report jsonb,
    publish_report jsonb,
    idempotency_key text,
    simulated_at timestamp without time zone,
    approved_at timestamp without time zone,
    approved_by_user_id character varying,
    published_at timestamp without time zone,
    failed_at timestamp without time zone,
    rolled_back_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp without time zone,
    last_error_code text,
    last_error_message text,
    last_error_details jsonb
);


--
-- Name: placement_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.placement_targets (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    plan_id character varying NOT NULL,
    location_id character varying NOT NULL,
    yodeck_playlist_id text NOT NULL,
    yodeck_media_id text,
    yodeck_media_name text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    error_message text,
    expected_impressions_per_week integer,
    score numeric(10,4),
    published_at timestamp without time zone,
    rolled_back_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: placements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.placements (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    contract_id character varying NOT NULL,
    screen_id character varying NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    seconds_per_loop integer DEFAULT 10 NOT NULL,
    plays_per_hour integer DEFAULT 6 NOT NULL,
    start_date date,
    end_date date,
    is_active boolean DEFAULT true NOT NULL,
    yodeck_playlist_id text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    max_screens integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    price_monthly_cents integer DEFAULT 0 NOT NULL,
    min_commit_months integer DEFAULT 3 NOT NULL
);


--
-- Name: portal_placements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_placements (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id character varying NOT NULL,
    screen_id character varying NOT NULL,
    status text DEFAULT 'selected'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    approved_at timestamp without time zone,
    live_at timestamp without time zone,
    paused_at timestamp without time zone,
    removed_at timestamp without time zone,
    last_reason text
);


--
-- Name: portal_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_tokens (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id character varying NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    token_ciphertext text
);


--
-- Name: portal_user_screen_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_user_screen_selections (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    portal_user_id character varying NOT NULL,
    screen_id character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: portal_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    email_verified_at timestamp without time zone,
    verify_token_hash text,
    verify_token_expires_at timestamp without time zone,
    change_email_token_hash text,
    change_email_token_expires_at timestamp without time zone,
    pending_email text,
    company_name text,
    contact_name text,
    phone text,
    kvk text,
    vat text,
    address text,
    plan_code text,
    onboarding_complete boolean DEFAULT false,
    advertiser_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: report_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id character varying NOT NULL,
    period_key text NOT NULL,
    live_locations_count integer DEFAULT 0 NOT NULL,
    estimated_visitors integer DEFAULT 0,
    estimated_impressions integer DEFAULT 0,
    regions_label text,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    sent_at timestamp without time zone
);


--
-- Name: report_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_metrics (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    report_id character varying NOT NULL,
    screen_id character varying NOT NULL,
    location_id character varying NOT NULL,
    scheduled_plays_estimate integer NOT NULL,
    scheduled_seconds_estimate integer NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id character varying NOT NULL,
    report_type text DEFAULT 'monthly'::text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    pdf_url text,
    generated_at timestamp without time zone DEFAULT now() NOT NULL,
    sent_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: revenue_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revenue_allocations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    advertiser_id character varying NOT NULL,
    screen_id character varying NOT NULL,
    location_id character varying,
    screen_days integer NOT NULL,
    visitor_weight numeric(4,2) NOT NULL,
    weight_override numeric(4,2),
    allocation_score numeric(12,4) NOT NULL,
    total_score_for_advertiser numeric(12,4) NOT NULL,
    advertiser_revenue_month numeric(12,2) NOT NULL,
    allocated_revenue numeric(12,2) NOT NULL,
    moneybird_invoice_ids jsonb,
    calculated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sales_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_activities (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    lead_id character varying NOT NULL,
    activity_type text NOT NULL,
    description text,
    outcome text,
    next_action text,
    next_action_date date,
    performed_by_user_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: schedule_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_snapshots (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    total_revenue numeric(12,2),
    total_weight numeric(12,2),
    generated_at timestamp without time zone DEFAULT now() NOT NULL,
    locked_at timestamp without time zone,
    locked_by_job_id character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: screen_content_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screen_content_items (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    screen_id character varying NOT NULL,
    yodeck_media_id integer NOT NULL,
    name text NOT NULL,
    media_type text,
    category text DEFAULT 'ad'::text NOT NULL,
    duration integer,
    is_active boolean DEFAULT true NOT NULL,
    linked_advertiser_id character varying,
    linked_placement_id character varying,
    detected_at timestamp without time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: screen_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screen_groups (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: screen_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screen_leads (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    business_type text NOT NULL,
    city text NOT NULL,
    company_name text NOT NULL,
    contact_name text NOT NULL,
    phone text NOT NULL,
    email text,
    visitors_per_week text,
    remarks text,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    inferred_category text,
    final_category text
);


--
-- Name: screens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screens (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    location_id character varying,
    name text NOT NULL,
    yodeck_player_id text,
    yodeck_player_name text,
    resolution text,
    orientation text DEFAULT 'landscape'::text,
    status text DEFAULT 'unknown'::text NOT NULL,
    last_seen_at timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    screen_id text NOT NULL,
    group_id character varying,
    yodeck_uuid text,
    yodeck_workspace_name text,
    yodeck_screenshot_url text,
    yodeck_content_count integer,
    yodeck_content_summary jsonb,
    yodeck_content_last_fetched_at timestamp without time zone,
    yodeck_content_status text DEFAULT 'unknown'::text,
    yodeck_screenshot_last_ok_at timestamp without time zone,
    yodeck_screenshot_byte_size integer,
    yodeck_content_error text,
    yodeck_screenshot_hash text,
    match_confidence text,
    match_reason text,
    moneybird_contact_id text,
    moneybird_sync_status text DEFAULT 'unlinked'::text,
    effective_name text,
    moneybird_contact_snapshot jsonb,
    location_group_id character varying,
    is_multi_screen_location boolean DEFAULT false,
    city text,
    onboarding_status text DEFAULT 'draft'::text,
    moneybird_sync_error text,
    moneybird_last_sync_at timestamp without time zone,
    yodeck_sync_status text DEFAULT 'not_linked'::text,
    yodeck_sync_error text,
    yodeck_last_sync_at timestamp without time zone,
    playlist_id text,
    playlist_name text,
    last_push_at timestamp without time zone,
    last_push_result text,
    last_push_error text,
    last_verify_at timestamp without time zone,
    last_verify_result text,
    last_verify_error text,
    baseline_playlist_id text,
    baseline_playlist_name text,
    ads_playlist_id text,
    ads_playlist_name text,
    combined_playlist_id text,
    combined_playlist_name text,
    playback_mode text DEFAULT 'PLAYLIST_ONLY'::text
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp without time zone NOT NULL
);


--
-- Name: site_contact_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_contact_snapshot (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    site_id character varying NOT NULL,
    company_name text,
    contact_name text,
    email text,
    phone text,
    address1 text,
    address2 text,
    postcode text,
    city text,
    country text,
    vat_number text,
    kvk_number text,
    raw_moneybird jsonb,
    synced_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: site_yodeck_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_yodeck_snapshot (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    site_id character varying NOT NULL,
    screen_name text,
    status text,
    last_seen timestamp without time zone,
    screenshot_url text,
    content_status text,
    content_count integer,
    raw_yodeck jsonb,
    synced_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sites (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    display_name text NOT NULL,
    moneybird_contact_id text,
    yodeck_screen_id text,
    multi_screen boolean DEFAULT false,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    yodeck_tags text[],
    sync_status text DEFAULT 'OK'::text,
    sync_error text,
    last_sync_at timestamp without time zone
);


--
-- Name: snapshot_placements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.snapshot_placements (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    snapshot_id character varying NOT NULL,
    placement_id character varying NOT NULL,
    contract_id character varying NOT NULL,
    screen_id character varying NOT NULL,
    location_id character varying NOT NULL,
    advertiser_id character varying NOT NULL,
    seconds_per_loop integer NOT NULL,
    plays_per_hour integer NOT NULL,
    days_active integer NOT NULL,
    weight numeric(12,2) NOT NULL,
    revenue_share numeric(10,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: supply_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supply_items (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    description text,
    default_price numeric(10,2),
    unit text DEFAULT 'stuk'::text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: survey_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_photos (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    survey_id character varying NOT NULL,
    storage_path text NOT NULL,
    filename text NOT NULL,
    description text,
    uploaded_by_user_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    category text
);


--
-- Name: survey_supplies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_supplies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    survey_id character varying NOT NULL,
    supply_item_id character varying,
    custom_name text,
    quantity integer DEFAULT 1 NOT NULL,
    notes text,
    estimated_price numeric(10,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sync_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_jobs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    entity_id character varying,
    provider text NOT NULL,
    action text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    error_message text,
    payload jsonb,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    finished_at timestamp without time zone
);


--
-- Name: sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    sync_type text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    items_processed integer DEFAULT 0,
    items_created integer DEFAULT 0,
    items_updated integer DEFAULT 0,
    error_message text,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    description text,
    category text DEFAULT 'general'::text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by text
);


--
-- Name: tag_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tag_policies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    tag_name text NOT NULL,
    tag_type text DEFAULT 'custom'::text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    requires_yodeck_creation boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: task_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_attachments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    task_id character varying NOT NULL,
    filename text NOT NULL,
    storage_path text NOT NULL,
    file_type text,
    uploaded_by_user_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    task_type text NOT NULL,
    priority text DEFAULT 'normaal'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    due_date date,
    survey_id character varying,
    lead_id character varying,
    location_id character varying,
    advertiser_id character varying,
    contract_id character varying,
    assigned_to_user_id character varying,
    assigned_to_role text,
    created_by_user_id character varying,
    completed_at timestamp without time zone,
    completed_by_user_id character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: template_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_versions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    template_id character varying NOT NULL,
    version integer NOT NULL,
    subject text,
    body text NOT NULL,
    placeholders text[],
    edited_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.templates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    subject text,
    body text NOT NULL,
    language text DEFAULT 'nl'::text,
    is_enabled boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    placeholders text[],
    e_sign_template_id text,
    e_sign_signing_order text[],
    e_sign_required_docs text[],
    moneybird_style_id text,
    created_by character varying,
    last_edited_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: terms_acceptance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.terms_acceptance (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id character varying NOT NULL,
    accepted_at timestamp without time zone DEFAULT now() NOT NULL,
    ip text,
    user_agent text,
    terms_version text NOT NULL,
    terms_hash text,
    source text DEFAULT 'onboarding_checkbox'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: upload_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_jobs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    advertiser_id character varying NOT NULL,
    ad_asset_id character varying,
    local_asset_path text NOT NULL,
    local_file_size integer NOT NULL,
    local_duration_seconds numeric(10,2),
    yodeck_media_id integer,
    yodeck_media_name text,
    status text DEFAULT 'QUEUED'::text NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    last_error text,
    last_error_at timestamp without time zone,
    yodeck_file_size integer,
    yodeck_duration numeric(10,2),
    yodeck_status text,
    next_retry_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    correlation_id text,
    desired_filename text,
    create_response jsonb,
    upload_url text,
    put_status integer,
    put_etag text,
    confirm_response jsonb,
    poll_attempts integer DEFAULT 0,
    final_state text,
    error_code text,
    error_details jsonb,
    finalize_attempted boolean DEFAULT false,
    finalize_status integer,
    finalize_url_used text
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email character varying,
    first_name character varying,
    last_name character varying,
    profile_image_url character varying,
    role text DEFAULT 'viewer'::text NOT NULL,
    location_id character varying,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    username character varying(50),
    display_name character varying(100),
    password_hash text,
    role_preset text,
    permissions text[],
    force_password_change boolean DEFAULT false
);


--
-- Name: verification_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_codes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    contract_document_id character varying
);


--
-- Name: waitlist_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist_requests (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    company_name text NOT NULL,
    contact_name text NOT NULL,
    email text NOT NULL,
    phone text,
    kvk_number text,
    vat_number text,
    package_type text NOT NULL,
    business_category text NOT NULL,
    competitor_group text,
    target_region_codes text[],
    required_count integer NOT NULL,
    status text DEFAULT 'WAITING'::text NOT NULL,
    last_checked_at timestamp without time zone,
    invite_token_hash text,
    invite_sent_at timestamp without time zone,
    invite_expires_at timestamp without time zone,
    claimed_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    advertiser_id character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_deliveries (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    webhook_id character varying NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    response_status integer,
    response_body text,
    delivered_at timestamp without time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhooks (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    event_types text NOT NULL,
    secret text,
    is_enabled boolean DEFAULT true NOT NULL,
    last_triggered_at timestamp without time zone,
    failure_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: yodeck_creatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.yodeck_creatives (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    yodeck_media_id integer NOT NULL,
    name text NOT NULL,
    media_type text,
    duration integer,
    category text DEFAULT 'ad'::text NOT NULL,
    advertiser_id character varying,
    last_seen_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    match_type text,
    match_confidence numeric(3,2),
    suggested_advertiser_id character varying
);


--
-- Name: yodeck_media_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.yodeck_media_links (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    yodeck_media_id integer NOT NULL,
    name text NOT NULL,
    normalized_key text NOT NULL,
    media_type text,
    category text DEFAULT 'ad'::text NOT NULL,
    duration integer,
    advertiser_id character varying,
    placement_id character varying,
    last_seen_at timestamp without time zone DEFAULT now() NOT NULL,
    screen_count integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'UNLINKED'::text NOT NULL,
    archived_at timestamp without time zone,
    match_type text,
    match_confidence numeric(3,2)
);


--
-- Name: yodeck_screens_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.yodeck_screens_cache (
    yodeck_screen_id text NOT NULL,
    name text,
    uuid text,
    status text,
    last_seen timestamp without time zone,
    screenshot_url text,
    raw jsonb,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Data for Name: ad_assets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ad_assets (id, advertiser_id, link_key, original_file_name, mime_type, size_bytes, storage_url, storage_path, duration_seconds, width, height, aspect_ratio, codec, validation_status, validation_errors, validation_warnings, required_duration_seconds, reviewed_by_admin_at, reviewed_by_admin_id, admin_notes, uploaded_at, created_at, stored_filename, approval_status, approved_at, approved_by, rejected_at, rejected_by, rejected_reason, rejected_details, pixel_format, conversion_status, conversion_started_at, conversion_completed_at, conversion_error, converted_storage_path, converted_storage_url, converted_codec, converted_pixel_format, converted_width, converted_height, converted_size_bytes, yodeck_media_id, yodeck_uploaded_at, yodeck_readiness_status, media_metadata, normalization_started_at, normalization_completed_at, normalization_error, normalized_url, superseded_by_id, yodeck_reject_reason, yodeck_metadata_json, normalization_provider, normalized_storage_path, normalized_storage_url, is_superseded, publish_status, publish_error, publish_attempts, last_publish_attempt_at) FROM stdin;
\.


--
-- Data for Name: advertiser_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.advertiser_accounts (id, advertiser_id, email, password_hash, created_at) FROM stdin;
976bf4bf-4a88-4542-8cdb-93cd4a8a8d66	e80e89d3-5893-4bc3-88cb-7042de798354	test-check1@example.com	$2b$10$6DP5vC7XmQKEPLO.JnRRguYtszdjlm.88ZbONXTNZxkNFc9iF0nxy	2026-02-12 01:07:17.433941
82151403-24a3-4146-99da-95f16a42adb9	eced4774-e531-4a5f-b809-d3a3f668c030	e2e-gu53pjan@test.com	$2b$10$4LYhztKQKM2AHEz9poIzmerK8sFMKtHnmaTe8EKrIzPvUGZgRJNxi	2026-02-12 01:09:49.970303
95bbdfe4-b3b1-40bc-8df9-324b72b9a796	21673d5b-fb08-4c42-952a-5c40edbc4df2	e2e-clzg3iin@test.com	$2b$10$xRZc1ANT7ENMMsrGDj.5zOKj6Jlcr/29bjDw7sILRxxqXbnQQaNFm	2026-02-12 01:13:02.43844
489b72a2-27ce-46a6-8434-ef218bcf1dac	3182ef14-1fc9-410d-975e-f0740efcb473	e2e-dash-ktsoupos@test.com	$2b$10$DtgSYh6PFdW5KAJzRvUB3OdgZ0sx4P6.tR4zFirqHXQ7/x8rmn0J.	2026-02-12 01:47:52.686359
\.


--
-- Data for Name: advertiser_leads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.advertiser_leads (id, goal, region, company_name, contact_name, phone, email, budget_indication, remarks, status, created_at, inferred_category, final_category) FROM stdin;
574bdc1a-b94f-40ea-aad4-2a0c4e7084b4	Contact formulier	Onbekend	Testbedrijf	Test Contact GAYBkF	0612345678	test@example.com	\N	Dit is een testbericht van de automatische tests.	new	2026-01-13 13:01:10.955111	contact	\N
bd3359a0-43c5-4644-8f7a-2076916937c8	Contact formulier	Onbekend	Test Bedrijf	Test User DSrG6x	0612345678	test_lStdNw@example.com	\N	Dit is een testbericht voor de audit 1-ouFQ	new	2026-01-13 15:36:31.205545	contact	\N
\.


--
-- Data for Name: advertisers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.advertisers (id, company_name, contact_name, email, phone, vat_number, address, moneybird_contact_id, status, notes, created_at, updated_at, iban, iban_account_holder, sepa_mandate, sepa_mandate_reference, sepa_mandate_date, kvk_number, street, zipcode, city, moneybird_contact_snapshot, country, customer_reference, is_business, website, invoice_email, attention, tags, invoice_delivery_method, language, payment_term_days, discount_percentage, sepa_bic, moneybird_sync_status, moneybird_sync_error, onboarding_status, source, moneybird_last_sync_at, invite_email_sent_at, confirmation_email_sent_at, whatnow_email_sent_at, link_key, link_key_generated_at, package_type, screens_included, package_price, package_notes, asset_status, accepted_terms_at, accepted_terms_ip, accepted_terms_user_agent, accepted_terms_version, accepted_terms_pdf_url, bundled_pdf_url, bundled_pdf_generated_at, video_duration_seconds, strict_resolution, target_region_codes, category, desired_impressions_per_week, business_category, competitor_group, upload_enabled, last_upload_token_generated_at, target_cities, yodeck_media_id_canonical, yodeck_media_id_canonical_updated_at, publish_error_code, publish_error_message, publish_failed_at, publish_retry_count, plan_id, onboarding_complete) FROM stdin;
c03e2782-5872-44a8-89cd-167a48edda1e	TechCorp Solutions	John Doe	john@techcorp.com	+31 20 123 4567	NL123456789B01	Herengracht 100, 1015 BS Amsterdam	\N	active	\N	2025-12-17 14:17:02.586322	2025-12-17 14:17:02.586322	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	not_linked	\N	draft	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
27ec0342-1652-4335-846d-e484214ebf17	Fresh Bakery	Sarah Smith	sarah@freshbakery.nl	+31 20 234 5678	NL987654321B01	Prinsengracht 200, 1016 HG Amsterdam	\N	active	\N	2025-12-17 14:17:02.586322	2025-12-17 14:17:02.586322	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	not_linked	\N	draft	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
39a03a44-ba36-445f-bf2d-2abab486b93d	City Gym	Mike Johnson	mike@citygym.nl	+31 20 345 6789	NL456789123B01	Damrak 50, 1012 LM Amsterdam	\N	paused	\N	2025-12-17 14:17:02.586322	2025-12-17 14:17:02.586322	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	not_linked	\N	draft	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
b59dcd32-a161-4b1a-a369-e211a833e0f0	Douven	Frank	frenkdoeven@hotmail.com	\N	\N	\N	\N	active	\N	2025-12-18 23:46:59.290032	2026-02-10 15:54:27.677	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	not_linked	\N	draft	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	live	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	29893553	2026-02-10 15:54:27.677	\N	\N	\N	0	\N	f
d90f575f-074d-42b4-8384-820f26b26d91	Test Bedrijf NEjL8Q	Jan de Test	jan@testbedrijfRMc3.nl			\N	\N	active	\N	2026-01-02 13:50:34.515699	2026-01-02 13:50:34.515699	\N	\N	f	\N	\N					\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	not_linked	\N	draft	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
6a94fb08-f173-4d74-b4fd-c89c13800eda	33HSiM_PortalTestBedrijf	(in te vullen via portal)	test_portal_33HSiM@example.com	\N	\N	\N	\N	active	\N	2026-01-02 14:18:02.772771	2026-01-02 14:18:02.772771	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	not_linked	\N	draft	quick_create	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
0288706f-1c89-4265-97cf-ff3821ca714e	TestBedrijf123	(in te vullen via portal)	test@example.com	\N	\N	\N	\N	active	\N	2026-01-02 14:19:34.450845	2026-01-02 14:19:34.450845	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	not_linked	\N	draft	quick_create	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
ad478908-f604-433d-80f5-bea0a8ebf371	TestBedrijf123	(in te vullen via portal)	test@example.com	\N	\N	\N	\N	active	\N	2026-01-02 14:19:53.703752	2026-01-02 14:19:53.703752	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	not_linked	\N	draft	quick_create	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
cd794287-b67a-46dd-a7c3-db41bd9bae1e	TestBedrijf123	(in te vullen via portal)	test@example.com	\N	\N	\N	\N	active	\N	2026-01-02 14:21:02.524428	2026-01-02 14:21:02.524428	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	not_linked	\N	draft	quick_create	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
fc022fe3-11c7-4ad3-adf4-9327b900cc8e	NcuZ8-_PortalTest	Test Contactpersoon	test_portal_CDgcf2@example.com	0612345678		\N	\N	active	\N	2026-01-02 14:24:11.60093	2026-01-02 14:24:36.714	\N	\N	f	\N	\N		Teststraat 123	1234 AB	Teststad	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	not_linked	\N	completed	quick_create	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
2c8eb929-c1dc-4e06-b215-d525727929da	TestBedrijf_C1GU0Z	Jan de Test	test.qozese@example.com	0612345678	NL123456789B01	\N	\N	active	\N	2026-01-14 01:17:49.187842	2026-01-14 01:17:49.187842	\N	\N	f	\N	\N	12345678	Teststraat 123	1234AB	Amsterdam	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	failed	moneybirdClient.upsertOrCreateContact is not a function	DETAILS_SUBMITTED	Website /start	\N	\N	\N	\N	ADV-TESTBEDRIJFC1GU0Z-BAB289	2026-01-14 01:17:49.182	TRIPLE	3	129.99	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	{NH}	\N	\N	horeca	horeca	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
e80e89d3-5893-4bc3-88cb-7042de798354	TestCompany	TestCompany	test-check1@example.com	\N	\N	\N	\N	active	\N	2026-02-12 01:07:17.429363	2026-02-12 01:07:17.429363	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	pending	\N	invited	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
0f9f4bd6-066d-4dcc-abcd-8257e416a67a	Bouwservice Douven	Frank Douven	info@bouwservicedouven.nl	0636166374	NL003546546B37	\N	476285874662802908	active	\N	2026-01-15 01:47:07.011716	2026-01-15 01:47:25.884	\N	\N	f	\N	\N	90954182	Engelenkampstraat 11	6131JD	Sittard	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	synced	\N	PACKAGE_SELECTED	Website /start	2026-01-15 01:47:07.919	\N	\N	\N	ADV-BOUWSERVICEDOUVEN-6E43D3	2026-01-15 01:47:07.012	SINGLE	1	49.99	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	{sittard}	\N	\N	gym	gym	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
eced4774-e531-4a5f-b809-d3a3f668c030	E2EBedrijf	E2EBedrijf	e2e-gu53pjan@test.com	\N	\N	\N	\N	active	\N	2026-02-12 01:09:49.933386	2026-02-12 01:10:10.059	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	pending	\N	invited	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	377eb4ce-bb8d-489f-b1ee-feed53d29f3a	f
21673d5b-fb08-4c42-952a-5c40edbc4df2	E2EBedrijf	E2EBedrijf	e2e-clzg3iin@test.com	\N	\N	\N	\N	active	\N	2026-02-12 01:13:02.417497	2026-02-12 01:13:20.331	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	pending	\N	invited	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	377eb4ce-bb8d-489f-b1ee-feed53d29f3a	f
3182ef14-1fc9-410d-975e-f0740efcb473	DashTest	DashTest	e2e-dash-ktsoupos@test.com	\N	\N	\N	\N	active	\N	2026-02-12 01:47:52.64923	2026-02-12 01:47:52.64923	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	NL	\N	t	\N	\N	\N	\N	email	nl	14	\N	\N	pending	\N	invited	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	none	\N	\N	\N	\N	\N	\N	\N	15	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	0	\N	f
\.


--
-- Data for Name: alert_rules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.alert_rules (id, alert_type, threshold_minutes, notify_emails, is_enabled, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, entity_type, entity_id, action, actor_type, actor_id, changes, metadata, created_at) FROM stdin;
4924e4c4-edef-4175-b520-51bdcabbf77c	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-19 18:14:19.358899
d8225922-54c4-4189-8149-59bcedc8e4b1	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-19 18:28:33.830895
70776a34-1df7-4626-8959-95f32d23c796	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-19 18:45:28.587928
85a6307f-77f1-4451-8199-189fa68014df	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-19 18:49:11.305299
816105c5-8d96-4915-9deb-eb236b25043e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-19 18:54:48.186735
19fb3677-24a5-47ab-a5a9-65b72ae49265	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-19 19:12:04.405681
03f8fdf2-5817-4d5f-b1ce-3a9a80e5fbbc	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-19 20:46:57.452071
e7b2a2a1-632a-4e3b-aed0-7888ea601917	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2025-12-22 16:47:00.265472
44fc82a8-272d-495b-99bc-9ee3b01307dc	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-23 00:26:24.885986
8cd3c52c-0600-419f-939d-5780be0c21eb	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-23 00:26:52.420574
ab63b9b3-b6eb-4aa8-9cd3-4124f66ea807	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-23 00:27:09.375433
93ee088c-6fbe-41ed-a372-cd008ad71468	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-23 00:27:38.972775
d6a18e19-d859-482d-902b-e32147c6d5ce	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-23 00:28:07.523545
058fc8e3-2e74-4a22-9c39-89e0cf03f464	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-23 00:36:33.024834
dd1d5f98-eaed-4591-9aae-359e3679a805	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-23 00:38:38.745031
6f6921ba-130d-4f43-81f4-a04bc2532043	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-23 00:38:50.420594
5cbb6064-92e2-4589-bd93-138c23df77d1	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-23 08:29:45.493318
c8a01665-1865-462d-abd8-357c40907479	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-23 08:29:54.753333
b1c5218a-e18e-425f-ab13-19fec1796169	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-23 09:56:55.182321
f1e97a3c-86d0-4c7b-8be1-afbe75080924	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-24 01:12:34.491777
38e07e85-e472-4ae1-8840-cca832c8294e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-24 01:43:09.422022
5ccf6e4f-db6d-42a0-b800-d6db3364fdab	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-24 01:44:33.566302
6b294d44-6c78-452e-af64-34a5848b833d	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-24 14:39:49.757565
a1ecf519-3e98-49ea-b48f-579605be368e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-24 15:04:29.017907
92c654f1-a10c-43fc-b4d1-d4709ea0e828	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-24 15:04:37.022141
aaa92905-a299-4e13-b885-af2eba9f5c21	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-24 15:04:44.926456
2c1e1ab4-5fca-4935-b61d-b0f22d4d2743	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-24 15:33:21.386319
7f78fc69-733a-401c-9c1f-192d362e872c	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-24 16:12:21.491546
a2f9c9de-44f4-4899-9579-811742bf977e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-24 18:56:24.818759
ab74789d-0276-48de-9973-994e9a2dc65e	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2025-12-24 19:44:23.246032
8733ff96-db88-454a-9222-98f8e15d59a5	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-24 21:05:43.34264
cfd0e2c2-49be-45fb-959b-505feb6d4d1d	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2025-12-25 15:33:10.377352
bb77cbef-5c2d-42d5-96dd-7bb0a5df91e2	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-25 15:34:32.526265
2cf8c6e8-2c0c-427f-aa96-6afad1782b69	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2025-12-26 14:41:34.402241
06c803fb-6907-478f-afee-779e94793821	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-26 17:26:00.090093
10ea28fe-7e1c-47ca-a6f7-872cd4f3698a	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2025-12-26 17:34:00.97949
d8fca3b9-c365-4307-a429-8162cd79b972	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2025-12-30 14:25:19.420961
6b9c32e2-21ed-49b2-be70-a28a1628a0b6	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-30 14:28:05.137386
9159e8d6-7d14-45cb-a231-f4b39d77fe87	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-30 16:44:40.419067
65691be9-ca60-444d-aebe-60df0c712361	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-30 16:57:06.662164
ba204238-94e1-49f4-8e0f-8049fa3023c7	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2025-12-30 17:07:37.441482
ea4c2cfc-645d-434f-8eea-c61ba69258bb	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2025-12-30 17:17:58.087349
e3682070-78eb-43c1-a029-ef81fe6063a6	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-02 14:08:24.130485
ef068d90-7004-4b5d-8287-ea95274c092a	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-02 14:17:17.83768
a9dcbc6a-dea3-4ea1-87b4-84c86edd8a93	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-02 14:23:19.430877
62d1277c-33fe-498c-b51a-59c09b41ff75	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-02 14:39:57.086662
d70f995c-9deb-43f8-a5ca-b5cd94c5e15a	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-02 15:09:57.630504
39d2106b-e774-4713-8ea2-45737c84ce61	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-02 15:13:39.332222
709acab4-3e52-4ae9-80f6-a9d130d81a17	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-06 23:39:57.737032
bfc73b21-69c6-4726-93fc-001c7e3334d1	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-07 00:36:43.604781
fc89a306-4b22-4624-ace1-23bc0e84c18e	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-08 21:20:55.655735
23918634-a64a-405f-9aaf-10c4aff08de9	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-08 23:14:22.259332
bef069af-08c4-4a90-b472-dfa77c13c5ba	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-08 23:14:47.481159
62a41f24-046e-4315-8998-8f358edab103	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-11 19:04:57.656321
35809b9c-c427-4874-988c-0813845134e9	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-11 20:09:33.842314
2ac1e229-6001-43b5-aabd-c26ccb1c097b	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-12 03:49:16.14399
fe90c181-c37b-4d4e-a09f-d735b3eae962	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-12 13:03:07.681178
c1fb348f-9303-4e6c-828d-517b24547271	auth	3399c0ad-339a-466b-9368-c6e0525cc0b5	login_success	user	3399c0ad-339a-466b-9368-c6e0525cc0b5	{"username": "testuser"}	\N	2026-01-12 13:33:52.173887
3eab8b26-8684-4689-8868-c1582c0d129f	auth	3399c0ad-339a-466b-9368-c6e0525cc0b5	login_success	user	3399c0ad-339a-466b-9368-c6e0525cc0b5	{"username": "testuser"}	\N	2026-01-12 13:36:32.966861
02d1120f-de30-4e8f-ad45-8faab55b5336	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-12 14:33:40.208301
ccc18ed6-9901-432a-a47e-f15937a8b88e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-12 16:04:31.024889
9b5a4ddf-6265-49a8-9061-debe74d9417e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-12 16:06:55.740893
51212111-c3fd-41f7-80a7-fa0cdedc4fb2	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-12 16:10:22.05182
90fc56cc-4e19-4a2c-bc69-55ad4230f9c7	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-12 16:15:40.382122
1efd5a12-b851-4467-99e4-f67a7bfd74ab	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-12 16:32:17.467605
ce701009-9c86-4459-a580-d95bc319b78e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-12 16:43:31.189046
b237a9e0-7df8-42a1-b664-fd406a0dea42	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-12 23:07:02.334615
6e588094-231b-4b94-a97b-6a25ab07764e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-12 23:22:24.669035
9c80d25d-1e14-4ad3-a69b-4e68fe76a8ef	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-13 00:45:53.509928
46eb4be4-463f-4542-ba14-65f87abe3414	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-13 17:43:49.710566
c7c6245d-cc5a-4997-85c8-945ce492a056	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-14 00:00:15.585302
7d54fe4e-4817-4146-b08c-998b01dfa200	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-14 00:49:46.68481
c3d01222-70f2-413a-976f-8b215257780b	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-14 01:48:58.212223
16881c5f-bb79-45eb-bd0d-2913d6eefeaf	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-14 14:02:50.845455
1eb42125-b170-46b9-a911-a8e0367c8517	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-14 19:09:21.387395
948021c9-4855-44cb-9100-953c3a3d25db	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-16 00:30:00.840764
e0c94d3c-b8dd-4014-813c-502456e36369	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-17 15:41:35.235224
f10bedc6-3d3b-4aa4-a816-c000b941d23d	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-17 16:03:35.210989
7c8eb81b-e3e1-4f4a-a61b-1d730bd79466	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-17 16:14:10.399598
9e2195f7-380e-49fb-a2cf-843b7e2102a9	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-18 22:30:03.725692
0d22f99a-03c4-40ed-bd51-0745c6c8976e	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-18 23:28:47.973636
923d3d42-02a1-4039-aa67-ea31a4d24b49	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-18 23:28:59.59726
82fb7679-57d9-4626-8521-a995464cf1bf	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-19 07:15:02.99963
015bea04-e7c8-43ab-8cf0-ffeef0a5b4c2	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-22 23:44:54.96299
3a88ad88-dddc-4510-a8f9-8a680ab93a62	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-23 18:05:09.059017
b122191d-592c-4a3a-9384-bf70939012b5	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-23 18:06:20.740317
e1aaefe6-ebd9-4d2f-a6e2-5ad9019f24e7	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-25 03:24:26.786727
3e569cfe-9737-4677-9bff-525f199db091	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-25 03:27:17.688291
212fc270-26da-4299-bd86-61dd09274941	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-25 03:28:42.20756
ec31aae9-cec7-4762-a244-36402cb17af3	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-25 03:31:58.08556
24944c57-2c9f-4e33-b13b-d94b246aef33	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-25 03:38:21.632022
8f57f329-90c5-4acf-9f03-bc6382820467	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-25 03:41:33.133998
59920136-8eb3-4578-ad7b-2401096743ea	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-25 03:41:59.291322
af959579-4805-4edb-b21e-0029ad66db5d	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-25 03:53:57.489339
7736564c-40da-4380-a11d-045e9a8e4c07	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-25 03:54:05.341159
07aa7fd7-8a45-4dd6-bdc9-a249b64de615	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-25 03:54:38.298238
17829791-51a2-4c5c-92ef-c1df9c353711	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-26 14:49:08.806301
d288e148-0c04-4191-a573-1e8c438aef0a	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-26 16:27:21.651686
46618a1b-417b-4b29-956e-62408f4524f3	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-01-26 17:07:33.30053
f384e354-f118-4ecc-96da-fd841adae6ea	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 14:48:56.984608
d6249a07-6adc-4e65-8096-3ca160e7abaa	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 14:49:26.117121
b7266cc9-54e8-48be-b37b-a3d17db6d282	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 14:49:46.65398
870e34bc-8dae-4af8-86c2-f4480d544eb9	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:00:08.534493
72539f32-e7e9-4172-a474-c572d8cb5586	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:01:26.649483
dc1b7bcd-6809-46b9-92cd-d2402e02a4e8	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:01:53.475288
fb23c843-0fe5-4f4f-bb7b-f020d539b8e4	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:02:05.450985
5e476409-5398-4e2e-be32-9e26954d39d7	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:02:51.477091
7e463776-301c-4046-a883-bfe058bc5236	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:03:35.801985
0b26cea5-4321-4e13-ab09-f3afed5f8cb1	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:03:54.107356
764179df-a886-4dfd-a21c-58790ce8a848	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:08:54.816168
49436f0e-ac98-4421-ab6e-38e3d5b08b04	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:11:35.283778
913e9128-414f-4e1b-9109-11065c23c393	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:21:32.35413
4a93ef79-5d6f-428f-a954-4f99841c9537	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:21:41.694023
01c0ec2f-cb3f-4dbc-bd2d-3360c4db707a	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:24:30.319231
4d233658-4f41-421b-bae9-606e4a0a2e4e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:25:28.017028
6d403bad-9996-49c4-9284-d8332ab2baaf	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:28:12.992593
12d4b65e-3659-48a6-a9c7-ed3237673b0e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:38:02.098597
c0143b31-3ba6-44e5-a51e-c72b61750da0	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:38:33.019124
3fa4f708-f69e-4c9c-ba2b-199c39335a50	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:43:37.885113
6cb341fd-d872-40da-a3a5-1c22ba9a49ea	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:59:02.409755
f244fa5f-8d10-41e0-8597-5983871ce709	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 15:59:21.939898
8c52a028-51c4-46f1-aa45-d4cf21e47b8f	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 16:13:59.336137
9bea9c7e-e19a-447f-9ab6-1a4e4823eba4	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 16:16:06.67595
2b32d28b-529f-490f-9659-009952e43245	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 16:20:20.179743
5226d2f9-0cac-420d-bb05-891430c4d5a2	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 17:01:11.545519
a996d06c-7437-426f-9507-1eef8186e845	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 17:01:30.737954
1ecabb01-7a9b-48de-84a0-880985cad070	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 17:01:42.191386
31d49ebb-c7a8-4018-9a10-dff96836bd1f	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 17:03:02.431211
3c28e374-3ac3-4225-a7fa-f919341da9d4	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 17:04:33.521474
1443204b-6868-4951-8b3a-69ceef470094	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 17:06:54.846942
167f22b8-bbbf-4630-bc3d-34ff00775b49	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 21:55:20.271226
b97801bc-f709-4a20-b36f-270f9b1c51fd	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 21:56:17.497455
77612dac-754f-4828-a298-578b3c883c70	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 21:58:03.022046
af7fad79-23d1-4453-817b-f636b25d97f2	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 22:16:20.270045
02c99ab2-467e-4093-871f-c89bbb3a3d2e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 22:16:37.727411
cbfcebc8-1c68-4b87-b987-cde71ef63b31	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 22:36:25.4055
699041a0-f5eb-4a11-aa6d-dfe36f85545e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 22:36:40.169237
cbdc9429-a8ac-49b1-b238-703675824a1b	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 22:36:51.563002
4c4e245f-8911-40d4-b861-167db76deb76	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 22:38:12.46293
62cf7fb4-5c4b-4093-88ef-530b2ac5d118	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 22:39:24.274052
21f1bf32-3bda-4ba9-8a62-12a46353049e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 22:40:10.771868
f885fb45-7695-4d88-aca7-a1eec4288fe4	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 22:41:01.574187
258b50b8-789f-40e8-b2cd-d2c0bf4978e5	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 22:41:30.304462
0d4e5c22-32f4-4f64-97ec-69e9aafd4a75	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 22:45:48.040004
26042038-f398-4be4-9d99-7f7beafb9e57	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:01:33.256561
5deea478-9fd3-46e6-a54d-1e62663ff969	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:01:48.462777
1f40dedb-c7b3-4199-a937-2ba982903b7b	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:02:50.801263
9c9b1a3b-6148-4c29-aa3e-b41a7f4253e5	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:07:56.555421
f8c18d41-b40a-4f44-82b8-1b9428ae607e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:10:48.576438
00e91cea-02e8-4a9b-a557-b6c45830c6ad	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:12:43.007842
6cf8cc55-f900-4e7e-97b0-dea1b5f71b24	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:14:48.464451
7b554d2f-04e4-4b68-ba5e-79d82e42b01e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:16:47.308902
8ded178b-f0ac-4464-bb60-30352aef3515	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:18:48.966607
23cd1ab5-35dd-452e-96ca-c8e27cc3a083	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:20:30.072206
c6d2bd91-0843-4b3c-bc51-335842956c6c	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:22:06.814024
e970a968-f800-4858-b97e-a380ab2850c3	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:43:30.261704
e3acb06e-816b-4f16-bf1c-1a06c556a664	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:43:59.335682
e3a65a27-45c1-4df4-8d65-7d3bce476498	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:45:07.24612
2c74a65d-1217-43e8-876f-c3fad678de15	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:45:54.44683
41fa5994-ae94-4e46-8e9d-bbdb33402fad	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:46:52.245534
7439acd2-1ca6-4c0b-9a2b-fee95a8dd4c6	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:47:35.597533
5720e3ad-f208-4056-aaf3-326853a50c0f	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:48:10.614121
695f0496-09ca-4449-aed5-4337d64043f2	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:48:50.581831
cd27954a-5a2f-479f-a0c0-2327e799cbc3	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-28 23:52:02.95535
6c5d45af-5eb8-401b-a2df-1d0ce31d4bb0	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 00:09:37.912688
1b5129bb-fb4d-4312-b748-10f496f73afc	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 00:11:58.773409
ce102a49-76cd-4c67-8ba1-503c1943c731	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 00:15:57.969238
43d3b9be-6267-46b2-b5e0-f58654759432	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 00:39:44.495833
cdf76c00-f7d7-4c05-bc01-f03f75bca6fb	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 00:40:31.845208
65a9520c-4a1b-4037-81bf-427ddf47ba86	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 00:41:49.056705
5a611991-4096-4e59-87bd-ecd35b107790	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 00:53:40.982661
7a26ad4b-0391-4ed5-b0bf-deba73180775	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 01:09:30.621621
1bc9eced-0d9c-4c94-9b43-a30a9fb4cb21	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 10:45:27.205304
10d68906-24f9-47ab-b2f5-f95a53f1e315	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 10:48:06.262917
24d65e75-6690-43d7-8edc-f8f3b962f1cb	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 10:49:37.454533
66ba4499-1e1b-4652-bf9a-b5cffe1b46eb	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 10:51:28.434079
4a1d5bb5-bbee-4a79-ae38-38b3f1b3533f	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 10:53:24.568992
54459660-3354-477c-955b-94b8557c9379	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 11:14:15.283228
7017bcf6-4427-4e84-8e34-f581b0af8aca	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 11:15:54.529535
5c96ad6c-925e-4475-b7f7-a03f4ad7c405	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 11:18:30.257793
5cac049a-553f-4d20-8b8e-b78875418d83	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 11:21:39.200268
c1b11e21-c5da-4b23-b87b-a7e941c91f00	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 13:14:57.619057
9227e840-0a91-4017-b9c3-a5bbf99f3f1b	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 13:18:43.158378
05c19dc9-2457-4117-b6d4-124854925eb1	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 13:19:23.692222
8f2bc55b-7b47-495f-8bc7-9e0ba8daf891	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 13:21:02.111644
c2e4ff85-7f76-4da0-91c6-03cf3e753694	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 13:44:30.861457
d2374ca4-d617-4672-993f-08d21021683b	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 14:05:22.478504
2479d469-6a4b-42f5-921f-a87ee4509646	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 14:08:28.877828
490c3dc5-19bf-42a8-ad54-f24efa70020b	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 14:09:30.743449
51b30db3-fb86-4811-b627-b59e18e8a739	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 14:10:51.917952
e94be81c-0cf9-45e6-bf7f-713e1e438950	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 14:12:43.442982
14c16383-14c2-4cce-ba97-93b149229058	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 14:31:32.608738
c8fcbe2d-7a06-4722-9fbf-9d8b69bbdc79	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 14:35:12.308304
eae2ada6-c9a3-4aff-9ca2-4ae60dc5fb3c	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 14:51:48.734269
71fb470b-7bc6-4ccd-81ab-8ca24ddd7dd9	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 14:53:22.863965
f1d3192a-2226-4464-9239-c3e7f748e80f	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 14:55:19.222117
b6135e53-cc17-4243-9f2f-f8e503cdfd5a	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:18:46.247299
ed3cd938-fa95-4a2f-bca8-d97b9a513718	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:19:25.52434
648dbd9a-7f08-43bf-86a4-6c0f50b3a520	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:20:25.563083
22d91045-938c-47e8-bdf5-d62d583f4eb9	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:21:00.340432
340f4cbf-bc37-4add-9651-afafa9cd06ad	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:21:50.518766
abadc6b5-bc02-45c8-af53-db9d64a96438	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:36:10.054778
f6e415cf-d678-428d-b3f0-6cead176ee22	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:36:57.884221
f95ad40b-2894-4cc8-a70f-89de5729b809	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:37:54.662182
479d3bae-71f0-4431-8332-b667aa5d60db	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:38:58.913075
51f8241e-e1cf-4e84-b58c-813211ed91b6	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:40:20.610978
a7c47282-edbd-4f20-a44a-2ea9480e0a6b	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:43:12.079848
093c418f-3593-45e8-b883-16da87db0f6c	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:43:49.646845
b223f2ce-905d-42ad-a8ff-9b5f86aa9591	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:57:23.85065
6be65499-f01f-4abc-9713-2d6d0e8ca84b	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 15:58:16.012536
30ae5a01-37d1-477a-88ba-197167e59549	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 16:00:30.686289
897d2439-58cb-40c9-8e8f-8803fd45897b	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 16:15:29.911958
e931e5c2-6042-482a-84a6-c4ab8dca8a7a	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 16:18:50.835888
2dbb2c34-116e-4cb1-8c3e-8a6599e305a6	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 16:21:52.564181
79d05e81-f48e-4b6e-8fa6-f5d722e1c3ef	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 23:26:14.590121
a773e287-4ee2-417e-be63-1e56296d555f	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 23:28:35.552548
166dc41d-c540-407f-baae-c895485c3288	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 23:29:15.007548
132f0267-a402-48d9-bc85-bc2bde41b9f8	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 23:29:44.046186
2e17033a-fdac-487b-a39e-65e6d60e3f42	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 23:30:20.840467
abd6fea7-59da-43c4-b291-708ce13ed46a	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 23:42:45.969268
5ad7a1a8-3959-4999-a514-2e9161d8eb55	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 23:42:58.619913
79736a20-924c-4104-9201-be61842b1d44	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 23:45:38.287159
e12e613f-003a-47a6-baf9-655a65b47e33	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-29 23:47:03.659559
9553b31b-8e1c-4fe3-a4d0-78caabaa01d1	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-30 00:08:26.156881
2af3bff0-cb8a-454a-8c13-fc3e76ee9226	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-30 00:10:47.518114
9176a3c8-a917-4db7-bdb7-cc12b72ec7a3	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-30 00:41:52.798305
4ec27cd2-a60f-4e98-aeb2-9584b66389f0	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-30 21:25:30.206756
2ee07682-b57f-487f-b529-073ce76e0054	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-30 21:35:29.841114
ac209bc2-6e35-474a-b3b5-6f0dccef39da	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-30 21:48:41.413861
99732998-5f11-4d97-b241-15940776ebaa	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-01-30 21:48:47.036203
2b37cf34-74da-48ef-9db5-5382c50a5ae3	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-02 11:21:56.871194
09697ed8-ecba-4a0e-b37f-d443de53ab98	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-02 11:25:44.382618
6ad76272-1834-4d84-a51f-d5550beecd2b	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-03 14:36:12.061021
3aa036c5-4a45-45b8-b857-c4d34978a37c	auth	51472361	login_failed	system	\N	{"reason": "invalid_password", "username": "admin"}	\N	2026-02-03 14:40:30.047345
9c5d28f9-5ac3-4887-9c95-c79f96a0ec5a	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-03 14:42:01.788217
d6d87edb-5008-49a4-946f-b0b2c029e966	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-03 15:01:18.220374
1bdb12ab-44fd-41db-99b3-10905656f4f9	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-03 15:34:01.910831
9d77397b-4fcd-41e9-bccb-8fbac4162534	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-04 13:35:49.859518
9bb6a494-f613-4688-a43e-c5634cdc578d	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 01:47:21.265084
642152b1-50a5-4a84-a821-d37d58dd0de0	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 02:34:41.910017
b647eee9-9e95-4964-879d-ffa92d7fa35b	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 02:34:48.571039
2a8b9bbd-09d7-4b3b-9f61-20707a285e54	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 02:36:32.316228
c7d213b8-240a-4cf0-8c59-e96b6bd49f0c	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 02:36:40.680032
41a058bc-acb2-4c99-87c4-470fda94bf24	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 02:36:49.821983
ebe4b343-5869-47bd-a8e1-8b6fade667ef	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 02:54:06.433959
65c32f77-7f89-4234-88ba-55e5d3e9484f	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 03:24:43.621667
4d69b842-05ca-4c82-afd7-c445c61d5691	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 11:08:42.726097
d2b819b7-a9f3-4e40-a77f-cacdeb4a6cf0	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 11:08:50.697802
24833ed7-dc7a-4641-8df4-15978ae99983	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 11:18:01.957057
451bfa50-be1f-467a-9889-83dd27b4cc71	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 12:30:10.075813
f197cc7e-30cf-4500-b278-6bea79c2feab	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-05 12:30:16.422581
2a842fb5-a760-4654-bf87-4093f2a6a52e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-07 16:21:11.291918
58533897-e677-4430-b437-dc8b2b9e6cd6	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-07 16:21:23.602485
0208eedf-6afb-461b-b53d-5cde805ddfda	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-07 16:22:19.946305
f28a2505-ead9-4b89-ad61-be715d335810	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-07 16:23:09.877914
965563bd-bf14-442d-b57f-12fbb6bbf587	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-07 16:55:50.547472
d9bdfece-1b12-4009-b3b4-fb10d182c3b3	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 03:20:00.37542
89c7005c-3d02-451d-9742-0a0693ce1809	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 03:23:24.123237
d6e23877-1138-4f64-abf0-406396581964	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 12:43:11.26604
960da766-7067-4371-8892-bba794699d19	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 13:27:42.695462
e6001124-b1dc-4aa1-9a7d-8e224c38cc75	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 13:30:06.639153
a5df08ad-9196-47cf-b039-aed7c4d6bf38	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 13:31:08.470942
27850d1e-4572-4b8a-8c13-cced88aa4cb6	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 13:34:43.478808
6c95c1cc-74d0-4c53-85d1-8e5350e6e7a0	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 13:36:30.921368
72811663-56d5-4592-95ca-e2cb9f6222c0	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 13:37:43.655944
ec0358fc-e9bf-4ea1-8ff8-70911b895565	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 13:49:59.6349
dd0345f6-57ce-48c3-afa9-2f025f115b65	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 13:59:46.131022
4768638f-0935-4044-b41d-f9ef2b4ea261	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 14:22:12.827553
fe0faa27-eeb9-4a02-9888-d567342d1121	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 14:45:31.463638
20d87b2c-af05-46fe-a58f-260205b5479f	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 15:00:17.049277
5d3a3f53-3218-4d4f-a55f-20f1501c6c7f	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 15:07:45.258491
93986ff1-e786-4e98-9d9c-061306a2fdf1	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 15:10:14.723407
bf970b42-5cb7-40d0-944e-c5254d1ff7b9	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 15:23:06.748667
0bd4acc5-1f98-49f7-b07a-d953d6a64b3c	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 15:24:22.194593
c6953806-16a8-4efa-88b9-b7521b32b3fb	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 15:40:46.92262
462e4a9e-da64-4083-b4a7-1606a91599d6	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-08 15:42:03.656925
2ae5df23-f318-4def-9c56-8ac47664732d	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-09 17:15:37.305106
8f2185e6-5470-4bee-84ee-417282fee2d0	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-09 22:07:30.879582
7abf742d-1822-41f4-aeb9-d1d03062e0b0	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-09 22:07:53.827185
8d57f96e-02ba-4315-bad7-e8e1e60e7f5e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-09 22:23:28.958257
74b6af8a-1c65-47ba-bbaa-07948df53ac9	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-09 23:00:25.9082
1a87f3ad-76e7-437d-8ad1-5b1593592936	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-09 23:00:41.560862
b43debfc-6cd4-4810-8b18-61ff10996c1c	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-09 23:18:23.035204
315fc271-780a-4ea1-b1d7-6706f5e85c92	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-09 23:29:17.315662
6d492d72-0b13-4204-9d95-cff12663beb6	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-09 23:43:54.556536
ef1b3dd3-e146-41d2-89fd-8976a5511f46	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-09 23:45:36.154881
1f4a5f6f-eeed-48a8-a378-49cfb90ed662	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 00:13:12.661591
b7eb2232-6f9a-411c-9e2c-3c60e226df20	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 00:13:27.088967
42a9bda2-bc9f-4bc5-ac65-c837c50df659	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 00:20:39.802495
5c76d39b-5fb6-4bd0-abc6-1ec00733f5cf	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 00:30:20.620761
3bd850eb-3dc3-4c4f-a44e-3cfeb90d3384	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 13:40:29.33209
a11bb5f4-dbf2-47fc-b148-177dbba5d79f	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 14:16:08.197099
8c13a115-95bc-4b8e-9d52-870c54e9cbc1	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 14:18:25.776387
c1fe96d1-06c8-4cc2-bf00-714daf2bb1e2	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:07:13.260859
f11e4e4c-f467-4918-91c0-10275f494057	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:07:21.453239
c75b1edd-3fd9-4dad-a274-64d71038ed83	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:07:31.668736
0df78d5a-58cc-4425-b949-a12cc24148c0	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:07:51.808216
ddeba1e2-11e4-42ea-b216-1d10dada0fdc	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:08:19.23745
0a2e61f9-88d6-49ee-82ec-14c5b7abc962	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:26:00.229829
503f1d9f-be0b-4675-a658-84f6f1cc2e90	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:28:58.739318
76f2693b-2523-492b-af4e-721999fd54ab	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:50:42.442797
c1838a0f-110f-4653-9f96-0113dbc7854c	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:50:51.283689
2449f784-e8a2-4f17-96d5-018176aa902f	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:51:00.049279
d6d779e2-b186-4924-a9b4-53ee26ea5e61	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:51:38.974184
a1240053-7f2e-4603-a3b3-dd4419f9c893	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:51:49.406296
53936029-fdc3-463a-9c6e-b81d12ffd7b0	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:54:24.330182
9ff6818a-0d08-4d56-b81c-53adcfcd8fa8	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-10 15:57:57.455226
521527dd-f5b7-4014-8de2-2b8267a0b8ac	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-11 00:22:22.980651
0bf0640f-c537-48e3-a498-ab4c4da82162	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-11 00:25:20.892006
f1485de2-f482-4d3c-a96d-ce4570288d04	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-11 00:32:59.528647
5683deaa-bb56-4593-8105-9fcbd5ce92f2	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-11 00:34:59.963724
f739c400-e1fb-4d15-b7b3-53a31847f886	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-11 01:17:15.432666
1c4b2e83-fb39-431b-acf0-5b76bf5cbfda	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-11 11:04:57.501188
01f4983d-7b6d-4785-abf5-4eb591822865	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-11 23:39:01.429485
0bbd752b-c7b1-4fa9-afe9-4eab76500345	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-12 15:09:44.817698
d2c9e8b7-8096-4a84-96ff-79cccee96270	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-12 15:17:11.472234
4305318e-6e64-4811-a3d1-8a8a46b68026	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-12 15:28:54.885137
57610d6e-047e-4a73-87f1-32d14da3839e	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-12 15:31:24.485828
1be67243-af39-47ee-bfa3-2e09425a2171	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-12 15:32:42.00169
6054fcdb-d9d6-43ae-9d40-e97aa13547d1	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-12 23:21:57.756261
099d228d-3def-4663-82b6-66ed9b8f98d9	auth	51472361	login_success	user	51472361	{"username": "admin"}	\N	2026-02-12 23:22:03.656487
\.


--
-- Data for Name: carry_overs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.carry_overs (id, location_id, from_payout_id, to_payout_id, amount, period_year, period_month, status, created_at) FROM stdin;
\.


--
-- Data for Name: claim_prefills; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.claim_prefills (id, waitlist_request_id, form_data, created_at, expires_at, used_at) FROM stdin;
\.


--
-- Data for Name: company_profile; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.company_profile (id, legal_name, trade_name, kvk_number, vat_number, address_line1, postal_code, city, country, public_address_enabled, email, phone, website, iban, iban_account_holder, bic_code, show_full_address_in_pdf, updated_at, created_at) FROM stdin;
ac88bfa4-7676-4146-b6e3-9f334237683f	Douven Services	Elevizion	90982541	NL004857473B37	Engelenkampstraat 11	6131 JD	Sittard	NL	f	info@elevizion.nl	\N	https://elevizion.nl	\N	\N	\N	t	2026-01-13 16:53:08.380763	2026-01-13 16:53:08.380763
\.


--
-- Data for Name: contact_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.contact_roles (moneybird_contact_id, role, created_at) FROM stdin;
\.


--
-- Data for Name: contract_documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.contract_documents (id, template_key, entity_type, entity_id, version_number, rendered_content, pdf_url, status, signed_at, created_at, updated_at, sign_provider, signrequest_document_id, signrequest_url, sign_status, signed_pdf_url, signed_log_url, sent_at) FROM stdin;
\.


--
-- Data for Name: contract_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.contract_events (id, contract_id, event_type, metadata, created_at, actor_type, actor_id, actor_name, ip_address, user_agent) FROM stdin;
\.


--
-- Data for Name: contract_files; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.contract_files (id, contract_id, file_type, file_name, storage_key, mime_type, file_size, sha256_hash, created_at) FROM stdin;
\.


--
-- Data for Name: contracts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.contracts (id, advertiser_id, package_plan_id, name, start_date, end_date, monthly_price_ex_vat, vat_percent, billing_cycle, status, notes, created_at, updated_at, version, title, pdf_url, html_content, signature_token_hash, sent_at, viewed_at, signed_at, expires_at, signed_by_name, signed_by_email, signed_ip, signed_user_agent, signature_data, target_region_codes_override, target_cities_override) FROM stdin;
2cbde3d3-fc7c-4ea2-984d-54f6f3ce83cb	c03e2782-5872-44a8-89cd-167a48edda1e	ef05b576-aaeb-4e35-b8e1-cfb0b89529b3	TechCorp Q1 2025	2025-01-01	2025-03-31	500.00	21.00	monthly	active	\N	2025-12-17 14:17:02.627063	2025-12-17 14:17:02.627063	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
b7f2f316-fd94-4a9d-aab5-502697c18a37	27ec0342-1652-4335-846d-e484214ebf17	dc17e14b-6c96-4ba8-b5e7-80939c866c63	Fresh Bakery 2025	2025-01-01	\N	250.00	21.00	monthly	active	\N	2025-12-17 14:17:02.627063	2025-12-17 14:17:02.627063	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
e67e03bb-d165-4da6-9e66-e554627f90da	39a03a44-ba36-445f-bf2d-2abab486b93d	dc17e14b-6c96-4ba8-b5e7-80939c866c63	City Gym Promo	2024-10-01	2024-12-31	300.00	21.00	monthly	ended	\N	2025-12-17 14:17:02.627063	2025-12-17 14:17:02.627063	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
d4323820-c28c-4bbe-b2b0-0f398f486d47	0f9f4bd6-066d-4dcc-abcd-8257e416a67a	\N	Bouwservice Douven Contract	2026-01-29	2027-01-29	150.00	21.00	monthly	active	\N	2026-01-29 13:20:18.189168	2026-01-29 13:20:18.189168	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
e9b988d6-23fd-4ecb-8c79-ee64abb1f6bb	b59dcd32-a161-4b1a-a369-e211a833e0f0	\N	Auto-contract Douven	2026-02-10	\N	0.00	21.00	monthly	active	\N	2026-02-10 15:51:00.144701	2026-02-10 15:51:00.144701	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: creative_approvals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.creative_approvals (id, creative_id, requested_at, approved_at, rejected_at, approved_by_user_id, notes, created_at) FROM stdin;
\.


--
-- Data for Name: creative_versions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.creative_versions (id, creative_id, version_no, file_url, file_name, mime_type, file_size, sha256_hash, created_at) FROM stdin;
\.


--
-- Data for Name: creatives; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.creatives (id, advertiser_id, creative_type, title, status, duration_seconds, notes, created_at, updated_at, phash, phash_updated_at) FROM stdin;
\.


--
-- Data for Name: digital_signatures; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.digital_signatures (id, document_type, document_id, signer_name, signer_email, signer_role, signature_data, signed_at, ip_address, user_agent, created_at) FROM stdin;
\.


--
-- Data for Name: e2e_test_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.e2e_test_runs (id, test_type, started_at, completed_at, ok, steps_json, error, test_location_id, test_media_id, triggered_by) FROM stdin;
\.


--
-- Data for Name: email_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_logs (id, to_email, template_key, entity_type, entity_id, status, provider_message_id, error_message, created_at, sent_at, subject_rendered, body_rendered, contact_name) FROM stdin;
b14d0d42-60ba-4d12-a90d-7a12e2958199	test@elevizion.nl	test_email	\N	\N	sent	9841b2dc-438e-46ce-93b3-2d1ba6759cff	\N	2026-01-05 17:31:45.068014	2026-01-05 17:31:45.351	\N	\N	\N
bb989b77-d2c7-4b13-aef3-87d016f251b5	test@elevizion.nl	verification_code	\N	\N	sent	e4525cbc-ee56-41b4-900e-fd7e0e358041	\N	2026-01-05 17:31:46.561999	2026-01-05 17:31:46.68	\N	\N	\N
bda8b2cb-cc10-44c5-b7e1-b10da5c4b862	info@elevizion.nl	location_onboarding_completed	location	23948825-266a-4165-b80b-3dc358686f34	sent	facf6cec-4b42-4631-9c17-6e917aca4886	\N	2026-01-07 00:48:30.838312	2026-01-07 00:48:31.073	\N	\N	\N
cb2a5599-53f5-4c98-9175-12081cf49d7c	info@elevizion.nl	lead_notification	\N	\N	sent	5308e3cf-f280-447e-bbb0-9e0f8dfcdee2	\N	2026-01-08 18:36:16.463113	2026-01-08 18:36:16.736	\N	\N	\N
7fa0686d-f467-4389-95ce-d16021609eb8	test9SLJ@example.com	lead_confirmation	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-08 18:36:16.742211	\N	\N	\N	\N
4b5b4398-4633-43a0-8d46-ef8b1dfcf7ed	info@elevizion.nl	lead_notification	\N	\N	sent	34376e2d-58e6-4b5b-be79-83fd492158e4	\N	2026-01-08 21:20:11.20007	2026-01-08 21:20:11.462	\N	\N	\N
129c7bf3-a1f0-4f71-bb8c-e793c63606d3	e2etestS8Cw@example.com	lead_confirmation	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-08 21:20:11.474354	\N	\N	\N	\N
d189a551-c82a-4e4e-87f1-02e8b3f18245	info@elevizion.nl	contact_form_internal	\N	\N	sent	1c5e11d2-95cb-4622-8282-6ae79610c73c	\N	2026-01-13 13:01:10.98029	2026-01-13 13:01:11.26	\N	\N	\N
ee66cbfb-d2c6-4feb-b97e-405f0de4a8cf	test@example.com	contact_form_confirmation	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-13 13:01:11.2693	\N	\N	\N	\N
bd13b730-4915-432b-88e8-3711ba6b35eb	info@elevizion.nl	contact_form_internal	\N	\N	sent	7cb70688-7e4d-4457-8c2d-625c0b4d39b7	\N	2026-01-13 15:36:31.231569	2026-01-13 15:36:31.514	\N	\N	\N
e2e5005c-bfd4-467b-b7d2-f04ba386b994	test_lStdNw@example.com	contact_form_confirmation	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-13 15:36:31.520554	\N	\N	\N	\N
0604d1a3-d86a-42f5-8518-5ff1e9131ace	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-15 00:50:56.312555	\N	\N	\N	\N
f49d2de5-38e6-44b9-9ca5-400e8114dc4d	info@elevizion.nl	lead_notification	\N	\N	sent	adf3acd8-6062-4373-b0db-193c89bbdbfc	\N	2026-01-15 02:15:40.842947	2026-01-15 02:15:41.079	\N	\N	\N
c7972ff4-a156-4969-bfac-3aa469e2496f	test@example.com	lead_confirmation	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-15 02:15:41.086677	\N	\N	\N	\N
1e34a7b3-f7ef-44bf-bb35-4d70bc1c41c1	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-17 01:11:06.714174	\N	\N	\N	\N
2c00d2ea-f55a-458b-9628-48c4c8c8f7e5	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-19 01:12:00.322187	\N	\N	\N	\N
44f9a560-f1cb-43dd-876b-eb9e50de303e	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-21 01:17:54.241282	\N	\N	\N	\N
887a4759-39e3-4983-8812-5da9587614ad	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-23 01:34:23.886684	\N	\N	\N	\N
2377a5f8-6a59-43b5-9246-41c7c9a04ab6	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-25 03:17:12.879788	\N	\N	\N	\N
00eada25-237d-4afe-ae8e-a368cc339012	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-27 03:33:10.119188	\N	\N	\N	\N
f6dd3301-6797-4588-8272-ee73fbdc4087	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-29 03:40:55.548446	\N	\N	\N	\N
d00d7666-6add-435e-852f-7899e4d84ece	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-01-31 03:53:26.632886	\N	\N	\N	\N
8ce77675-e221-4816-b789-8c6c5b7e99a5	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-02-02 11:10:53.55963	\N	\N	\N	\N
e7f92651-b671-4abf-bfca-9be8a573485a	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-02-04 13:08:07.950836	\N	\N	\N	\N
f9b2bb0c-5057-4ab3-9e7f-027b179716b5	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-02-06 13:29:09.263315	\N	\N	\N	\N
bdafa0ea-c0bc-4338-ad36-49b56aa67432	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-02-08 13:33:12.031171	\N	\N	\N	\N
37671672-c226-463a-b402-3ed8abd99103	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-02-10 13:42:30.837639	\N	\N	\N	\N
9ed7a55d-149a-4a7b-8928-8bde1d3352e1	test-dvnluz@example.com	portal_verify_email	portal_user	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-02-12 02:29:59.376283	\N	\N	\N	\N
d87977ed-75eb-46ae-b8f8-7e03429cab94	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-02-12 14:10:35.10322	\N	\N	\N	\N
675ef341-e30d-4a52-a340-d68ac2dfb754	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-02-14 14:12:52.530712	\N	\N	\N	\N
fe84118d-2ea6-4e85-a7a8-bbbaee68d6d2	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-02-17 09:13:53.566625	\N	\N	\N	\N
ca558248-3213-4e37-8f97-fd18bc2c1e24	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-02-19 10:41:56.037558	\N	\N	\N	\N
e7e6ca04-7c38-43f9-a849-e5225759525d	test@example.com	waitlist_claim_invite_nl	\N	\N	failed	\N	You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.	2026-02-24 00:09:34.057923	\N	\N	\N	\N
\.


--
-- Data for Name: entities; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.entities (id, entity_type, entity_code, display_name, status, moneybird_contact_id, yodeck_device_id, tags, contact_data, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: incidents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.incidents (id, incident_type, severity, screen_id, location_id, status, title, description, metadata, opened_at, acknowledged_at, resolved_at, last_seen_at, created_at, updated_at, assignee_user_id) FROM stdin;
\.


--
-- Data for Name: integration_configs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.integration_configs (id, service, is_enabled, status, last_tested_at, last_test_result, last_test_error, last_sync_at, last_sync_items_processed, sync_frequency, settings, created_at, updated_at, encrypted_credentials, credentials_configured) FROM stdin;
5ad6cc99-abf2-40e7-b1cd-2441d9bf80d9	signrequest	f	error	2026-01-12 23:23:30.711	error	API Fout: 401 - {"detail":"Invalid token"}	\N	\N	15min	\N	2026-01-12 23:23:30.715268	2026-01-12 23:23:30.715268	\N	\N
7d8343cb-9c96-45e3-8dd1-2294a4f03c8a	{"integrationName":"yodeck_baseline","settings":{"baselineMediaIds":[27478716,27476141,27477130,27476083]},"enabled":true}	f	not_configured	\N	\N	\N	\N	\N	15min	\N	2026-01-29 15:36:36.259769	2026-01-29 15:37:05.712	\N	\N
4762066e-e66d-4a52-832e-32c8a07d5e32	yodeck_baseline	f	not_configured	\N	\N	\N	\N	\N	15min	{"baselineMediaIds": [27478716, 27476141, 27477130, 27476083]}	2026-01-29 15:37:54.728189	2026-01-29 15:37:54.728189	\N	\N
8aa18d12-7b1f-4715-867f-59c5f8b8d6ff	yodeck	t	connected	\N	{"success":true,"count":2,"testedAt":"2026-02-24T00:26:48.055Z"}	\N	2026-01-28 15:11:54.556	2	15min	\N	2025-12-19 19:13:09.189904	2026-02-24 00:26:48.055	el5w4nbSO+r/Z80L5j032il8+jyA8q1v/pCrvfE6AKzS6qqMNwiIBh7wVD3MWTigYBLf8RvAmCNu0+1hMsNJgT+J42MEFyPJn95KCHoXGvrxCliA/qQmltEC4q6jpUlolpDfS0pagASdZXfdZTUSmpjOrs9ri8MCBrGJiIjAEDfLcbB1+Mmf0RzIafbqQ69U4cqvSPz2bTrof9gUgShAlfqFvTgRDxO5mmI/0S8m	{"api_key": true}
88b8b81d-547f-4e87-a3a2-932c6d470714	moneybird	t	connected	\N	\N	\N	2026-02-24 00:27:48.372	3	15min	\N	2025-12-25 15:11:59.232223	2026-02-24 00:27:48.373	\N	\N
\.


--
-- Data for Name: integration_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.integration_logs (id, service, action, status, request_data, response_data, error_message, duration_ms, created_at) FROM stdin;
\.


--
-- Data for Name: integration_outbox; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.integration_outbox (id, provider, action_type, entity_type, entity_id, payload_json, idempotency_key, status, attempts, max_attempts, last_error, external_id, response_json, next_retry_at, processed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoices (id, advertiser_id, contract_id, snapshot_id, invoice_number, period_start, period_end, amount_ex_vat, vat_amount, amount_inc_vat, status, due_date, paid_at, moneybird_invoice_id, moneybird_invoice_url, notes, created_at, updated_at) FROM stdin;
20a37b7c-f022-466f-8f9c-49d3e46c5692	c03e2782-5872-44a8-89cd-167a48edda1e	2cbde3d3-fc7c-4ea2-984d-54f6f3ce83cb	\N	INV-2024-0001	2024-11-01	2024-11-30	500.00	105.00	605.00	paid	2024-12-15	2024-12-10 00:00:00	\N	\N	\N	2025-12-17 14:17:02.63741	2025-12-17 14:17:02.63741
b4ed7ca4-a1ff-41e5-8db8-a2fb4bbfc952	27ec0342-1652-4335-846d-e484214ebf17	b7f2f316-fd94-4a9d-aab5-502697c18a37	\N	INV-2024-0002	2024-11-01	2024-11-30	250.00	52.50	302.50	sent	2024-12-15	\N	\N	\N	\N	2025-12-17 14:17:02.63741	2025-12-17 14:17:02.63741
\.


--
-- Data for Name: job_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.job_runs (id, job_id, status, started_at, completed_at, duration_ms, result_summary, error_message, created_at) FROM stdin;
\.


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.jobs (id, name, type, schedule, is_enabled, last_run_at, last_run_status, last_error_message, next_run_at, created_at, updated_at) FROM stdin;
07d39903-28d3-4602-97d8-dfeef6b986e2	yodeck_sync	sync	0 2 * * *	t	\N	\N	\N	\N	2025-12-17 14:17:02.641568	2025-12-17 14:17:02.641568
fc494b58-d150-421d-9ec5-a337fd41d2c6	moneybird_sync	sync	0 3 * * *	t	\N	\N	\N	\N	2025-12-17 14:17:02.641568	2025-12-17 14:17:02.641568
c6f031b6-bda2-4bf3-b188-a72a45d7d2aa	monthly_snapshot	generate	0 0 1 * *	t	\N	\N	\N	\N	2025-12-17 14:17:02.641568	2025-12-17 14:17:02.641568
9720b663-151c-4dd4-bb3b-6077c29f860d	monthly_invoices	invoice	0 6 1 * *	t	\N	\N	\N	\N	2025-12-17 14:17:02.641568	2025-12-17 14:17:02.641568
61d0e189-713c-4c0e-8c45-10e0a9f044be	overdue_check	invoice	0 9 * * *	t	\N	\N	\N	\N	2025-12-17 14:17:02.641568	2025-12-17 14:17:02.641568
\.


--
-- Data for Name: leads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.leads (id, type, company_name, contact_name, email, phone, address, notes, status, source, assigned_to_user_id, expected_value, follow_up_date, converted_at, converted_to_id, created_at, updated_at, city, postcode, kvk_number, inferred_category, inferred_confidence, final_category, category_updated_at, category, is_handled, handled_at, handled_by, is_deleted, deleted_at, deleted_by) FROM stdin;
1a966455-1711-4c37-b0cd-88fd903f4fa4	location	Test Bedrijf gG5zEP	Jan Jansen					nieuw		\N	\N	\N	\N	\N	2025-12-18 15:14:59.295239	2025-12-18 15:14:59.295239	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	f	\N	\N
da21f446-b804-4f57-aa90-55253dc07373	location	Test Locatie veQZ_m	Jan Tester	test@example.com				voorstel		\N	\N	\N	\N	\N	2025-12-18 16:33:09.389599	2025-12-18 16:35:06.193	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	f	\N	\N
6c286c17-0102-45ef-bc9d-e13b1467443a	advertiser	Bouwservice	frank					nieuw		\N	\N	\N	\N	\N	2025-12-18 16:42:06.981762	2025-12-18 16:42:06.981762	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	f	\N	\N
a4819621-4b28-4e15-8aea-caa45594c3ab	location	Test Cafe VH6wRM	Jan Tester	\N	0612345678	Teststraat 1, Amsterdam	\N	schouw_gepland	\N	\N	\N	\N	\N	\N	2025-12-18 16:49:43.187136	2025-12-18 16:49:43.187136	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	f	\N	\N
9ab6b461-237e-4f37-a247-34998d0a31d2	location	douven	Onbekend	\N	\N	\N	\N	schouw_gepland	\N	\N	\N	\N	\N	\N	2025-12-18 17:49:52.918552	2025-12-18 17:49:52.918552	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	f	\N	\N
96045d3c-cf05-46cf-b688-fdaa41c7770e	advertiser	Test Bedrijf vWr1cs	Test Persoon	test9SLJ@example.com	0612345678	\N	\N	nieuw	website	\N	\N	\N	\N	\N	2026-01-08 18:36:16.412909	2026-01-08 18:36:16.412909	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	f	\N	\N
46493f04-8e9f-4463-aae0-bce92242cb8a	advertiser	E2E Test r_aNun	Test Contact	e2etestS8Cw@example.com	0612345678	\N	\N	nieuw	website	\N	\N	\N	\N	\N	2026-01-08 21:20:11.160213	2026-01-08 21:20:11.160213	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	f	\N	\N
3841a7f4-bcc7-47ce-befd-f38cdbbc89a2	advertiser	Basil's Barbershop	Basil van der Berg	basil@barbershop-test.nl	06-12345678	\N	Auto-categorisatie: beauty (83% zekerheid) - Dit is een testlead	nieuw	test	\N	\N	\N	\N	\N	2026-01-11 20:19:54.787023	2026-01-11 20:19:54.787023	\N	\N	\N	beauty	0.83	\N	\N	beauty	f	\N	\N	f	\N	\N
bd530e82-71e8-45b1-9084-ebdd8cddc8ed	location	Testbedrijf BV	Jan Tester	test@example.com	0612345678	\N	\N	nieuw	website	\N	\N	\N	\N	\N	2026-01-15 02:15:40.823749	2026-01-15 02:15:40.823749	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	f	\N	\N
\.


--
-- Data for Name: location_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.location_groups (id, name, moneybird_contact_id, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: location_onboarding_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.location_onboarding_events (id, location_id, event_type, event_data, created_at) FROM stdin;
d40ae4ee-8b12-4f9e-90c1-fd838ab5f0f9	470ac4e6-ba67-4ef1-9376-efad530f8010	location_created	{"email": "test-ABhBXS@example.com", "method": "quick_create"}	2026-01-07 00:14:04.76957
9656dfc6-9f1d-4781-b168-d10594bbccf9	470ac4e6-ba67-4ef1-9376-efad530f8010	details_submitted	{"submittedFields": ["name", "contactName", "phone", "street", "houseNumber", "zipcode", "city", "visitorsPerWeek", "openingHours", "branche"]}	2026-01-07 00:14:51.029824
bbfb3085-33c8-497b-a68c-3247392d275e	23948825-266a-4165-b80b-3dc358686f34	location_created	{"email": "test-abc@example.com", "method": "quick_create"}	2026-01-07 00:47:23.000478
cbd28754-1f36-4c0c-a70e-3ce45d2c7e2a	23948825-266a-4165-b80b-3dc358686f34	details_submitted	{"submittedFields": ["name", "contactName", "phone", "street", "houseNumber", "zipcode", "city", "visitorsPerWeek", "openingHours", "branche"]}	2026-01-07 00:48:30.832678
\.


--
-- Data for Name: location_payouts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.location_payouts (id, period_year, period_month, location_id, allocated_revenue_total, payout_type, revenue_share_percent, fixed_amount, payout_amount, minimum_threshold, carried_over, status, approved_at, approved_by_user_id, paid_at, payment_reference, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: location_surveys; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.location_surveys (id, lead_id, location_id, survey_date, survey_by_user_id, has_wifi_available, wifi_network_name, has_power_outlet, power_outlet_location, proposed_screen_count, proposed_screen_locations, wall_mount_possible, ceiling_mount_possible, stand_mount_possible, foot_traffic_estimate, target_audience, competing_screens, competing_screens_notes, proposed_revenue_share, installation_notes, estimated_installation_cost, status, photos, notes, created_at, updated_at, wifi_password_encrypted) FROM stdin;
9e9f0d73-1ba7-4ca5-a2e4-8b800d213b55	da21f446-b804-4f57-aa90-55253dc07373	\N	2025-12-18	\N	t	\N	t	\N	2	\N	t	f	f	gemiddeld	\N	f	\N	10.00	\N	\N	afgerond	\N	\N	2025-12-18 16:34:39.81409	2025-12-18 16:35:06.189	\N
\.


--
-- Data for Name: location_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.location_tokens (id, location_id, token_hash, expires_at, used_at, created_at) FROM stdin;
c2b4bf4a-c8c5-45c1-b397-22e1ed37bfe5	470ac4e6-ba67-4ef1-9376-efad530f8010	d0d28272408270da74e7d047303934260de466b8ff2a4e10fe3680440c7bd647	2026-01-14 00:14:04.763	2026-01-07 00:14:50.995	2026-01-07 00:14:04.76414
cccf961d-5b3a-43eb-89a0-673275a8fd21	23948825-266a-4165-b80b-3dc358686f34	ea840fa4abaf207350e111add835cd1642d816e7714ef55d5214dd9db4fcbef0	2026-01-14 00:47:22.994	2026-01-07 00:48:30.817	2026-01-07 00:47:22.995709
\.


--
-- Data for Name: locations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.locations (id, name, address, contact_name, email, phone, revenue_share_percent, minimum_payout_amount, bank_account_iban, status, notes, created_at, updated_at, street, zipcode, city, moneybird_contact_id, is_placeholder, source, onboarding_status, moneybird_sync_status, moneybird_sync_error, moneybird_last_sync_at, location_code, house_number, visitors_per_week, opening_hours, branche, pi_status, yodeck_device_id, yodeck_status, invite_email_sent_at, reminder_email_sent_at, payout_type, fixed_payout_amount, last_reminder_sent_at, location_key, country, location_type, bank_account_name, intake_token, intake_token_expires_at, intake_token_used_at, contract_token, contract_token_expires_at, contract_token_used_at, reviewed_at, reviewed_by, review_decision, accepted_terms_at, accepted_terms_ip, accepted_terms_user_agent, accepted_terms_version, accepted_terms_pdf_url, contract_instance_id, intake_confirmation_sent_at, contract_email_sent_at, completion_email_sent_at, bundled_pdf_url, bundled_pdf_generated_at, region_code, categories_allowed, audience_category, avg_visitors_per_week, ad_slot_capacity_seconds_per_loop, current_ad_load_seconds, loop_duration_seconds, yodeck_playlist_id, last_sync_at, exclusivity_mode, needs_review, needs_review_reason, ready_for_ads, paused_by_admin, playlist_mode, playlist_tag, yodeck_playlist_verified_at, yodeck_playlist_verify_status, last_yodeck_verify_error, yodeck_layout_id, yodeck_baseline_playlist_id, layout_mode, combined_playlist_id, combined_playlist_verified_at, combined_playlist_item_count) FROM stdin;
a7407806-477f-4095-b3d8-c523ddec9d9c	Central Mall	Kalverstraat 1, 1012 NX Amsterdam	Alice Manager	alice@centralmall.nl	+31 20 456 7890	10.00	25.00	NL91ABNA0417164300	active	\N	2025-12-17 14:17:02.609259	2026-01-30 19:31:25.938479	Kalverstraat 1	1012 NX	Amsterdam	\N	f	manual	draft	not_linked	\N	\N	\N	\N	\N	\N	\N	not_installed	\N	not_linked	\N	\N	revshare	\N	\N	\N	Nederland	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	120	0	300	30462019	\N	STRICT	f	\N	t	f	TAG_BASED	elevizion:location:a7407806-477f-4095-b3d8-c523ddec9d9c	2026-01-27 23:29:08.217+00	OK	\N	\N	30422151	FALLBACK_SCHEDULE	30491688	2026-01-28 01:15:02.734	2
16b5c6b8-bd41-4a64-9445-1f657489f05f	Bouwservice Douven	Engelenkampstraat 11	Bouwservice Douven	info@bouwservicedouven.nl	+31636166374	10.00	25.00	\N	active	\N	2025-12-26 15:34:00.710361	2026-01-28 23:02:51.514	Engelenkampstraat 11	6131JD	Sittard	474516820946060382	t	yodeck	draft	not_linked	\N	\N	\N	\N	\N	\N	\N	not_installed	591896	not_linked	\N	\N	revshare	\N	\N	\N	Nederland	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	120	0	300	30449618	\N	STRICT	f	\N	t	f	TAG_BASED	elevizion:location:16b5c6b8-bd41-4a64-9445-1f657489f05f	2026-01-27 23:28:55.047+00	UNKNOWN	\N	\N	30400683	PLAYLIST	30449618	2026-01-28 22:45:48.991	2
2d90dbc4-ea08-463e-84cf-13a8023a93dc	Basil's Barber Shop Maasbracht	Onbekend	\N	\N	\N	10.00	25.00	\N	active	\N	2025-12-26 15:33:48.79616	2026-01-30 19:31:25.938479	\N	\N	Maasbracht	\N	t	yodeck	draft	not_linked	\N	\N	\N	\N	\N	\N	\N	not_installed	591895	not_linked	\N	\N	revshare	\N	\N	\N	Nederland	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	120	0	300	30481364	\N	STRICT	f	\N	t	f	TAG_BASED	elevizion:location:2d90dbc4-ea08-463e-84cf-13a8023a93dc	2026-01-27 23:28:45.143+00	UNKNOWN	\N	\N	30461398	FALLBACK_SCHEDULE	30491686	2026-01-28 01:14:55.933	2
59cdcc29-e6c8-4bc4-b5e9-a8ac50d13141	Airport Terminal 1	Evert van de Beekstraat 202, 1118 CP Schiphol	Bob Operator	bob@schiphol.nl	+31 20 567 8901	15.00	50.00	NL91INGB0001234567	active	\N	2025-12-17 14:17:02.609259	2026-01-30 19:31:25.938479	Evert van de Beekstraat 202	1118 CP	Schiphol	\N	f	manual	draft	not_linked	\N	\N	\N	\N	\N	\N	\N	not_installed	\N	not_linked	\N	\N	revshare	\N	\N	\N	Nederland	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	120	0	300	30461880	\N	STRICT	f	\N	t	f	TAG_BASED	elevizion:location:59cdcc29-e6c8-4bc4-b5e9-a8ac50d13141	2026-01-28 01:12:06.75+00	UNKNOWN	\N	\N	30461395	FALLBACK_SCHEDULE	30491684	2026-01-28 01:14:49.572	2
470ac4e6-ba67-4ef1-9376-efad530f8010	Complete Test Location qeJR	\N		test-ABhBXS@example.com		10.00	25.00	\N	pending_pi	\N	2026-01-07 00:14:04.756677	2026-01-07 00:14:51.009	Teststraat	1234 AB	Amsterdam	\N	f	manual	details_completed	not_linked	\N	\N	EVZ-LOC-001	42	500	Ma-Vr 9:00-18:00	Fitness	not_installed	\N	not_linked	\N	\N	revshare	\N	\N	\N	Nederland	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	120	0	300	\N	\N	STRICT	f	\N	f	f	TAG_BASED	elevizion:location:470ac4e6-ba67-4ef1-9376-efad530f8010	\N	UNKNOWN	\N	\N	\N	FALLBACK_SCHEDULE	\N	\N	0
23948825-266a-4165-b80b-3dc358686f34	Test Sportschool ABC	\N		test-abc@example.com		10.00	25.00	\N	pending_pi	\N	2026-01-07 00:47:22.990185	2026-01-07 00:48:30.826	Teststraat	1234 AB	Amsterdam	\N	f	manual	details_completed	not_linked	\N	\N	EVZ-LOC-002	123	500			not_installed	\N	not_linked	\N	\N	revshare	\N	\N	\N	Nederland	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	120	0	300	\N	\N	STRICT	f	\N	f	f	TAG_BASED	elevizion:location:23948825-266a-4165-b80b-3dc358686f34	\N	UNKNOWN	\N	\N	\N	FALLBACK_SCHEDULE	\N	\N	0
76142c5b-991b-4683-8480-bff5124fb7e1	Train Station Central	Stationsplein 1, 1012 AB Amsterdam	Carol Station	carol@ns.nl	+31 20 678 9012	12.00	30.00	\N	active	\N	2025-12-17 14:17:02.609259	2026-01-30 19:31:25.938479	Stationsplein 1	1012 AB	Amsterdam	\N	f	manual	draft	not_linked	\N	\N	\N	\N	\N	\N	\N	not_installed	\N	not_linked	\N	\N	revshare	\N	\N	\N	Nederland	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	120	0	300	30462013	\N	STRICT	f	\N	t	f	TAG_BASED	elevizion:location:76142c5b-991b-4683-8480-bff5124fb7e1	2026-01-28 01:12:11.601+00	UNKNOWN	\N	\N	30461397	FALLBACK_SCHEDULE	30491685	2026-01-28 01:14:52.551	2
\.


--
-- Data for Name: moneybird_contacts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.moneybird_contacts (id, moneybird_id, company_name, firstname, lastname, email, phone, address1, address2, zipcode, city, country, chamber_of_commerce, tax_number, sepa_active, sepa_iban, sepa_iban_account_name, sepa_mandate_id, sepa_mandate_date, customer_id, advertiser_id, last_synced_at, created_at, updated_at) FROM stdin;
8898ba65-d250-403d-a431-8f4b79d5ab58	476285874662802908	Bouwservice Douven	\N	\N	info@bouwservicedouven.nl	0636166374	Engelenkampstraat 11	\N	6131JD	Sittard	NL	90954182	NL003546546B37	f	\N	\N	\N	\N	2	\N	2026-02-24 00:27:48.181	2026-01-15 01:52:30.472274	2026-02-24 00:27:48.181
1a7b1378-46c4-4c98-bcfb-25d202ef94cb	476370066957403715	Bouwservice Douven	\N	\N	info@bouwservicedouven.nl	0636166374	Engelenkampstraat 11	\N	6131JD	Sittard	NL	90954182	NL003546546B37	f	\N	\N	\N	\N	3	\N	2026-02-24 00:27:48.19	2026-01-16 00:11:58.801004	2026-02-24 00:27:48.19
728cdd1e-1561-40a9-9d51-5c84e7b600ab	474516820946060382	Bouwservice Douven	\N	\N	info@bouwservicedouven.nl	+31636166374	Engelenkampstraat 11	\N	6131JD	Sittard	NL	90982541	NL004857473B37	f	NL62KNAB0616197497	Bouwservice Douven	\N	\N	1	\N	2026-02-24 00:27:48.045	2025-12-26 13:13:22.568887	2026-02-24 00:27:48.045
\.


--
-- Data for Name: moneybird_contacts_cache; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.moneybird_contacts_cache (moneybird_contact_id, company_name, contact_name, email, phone, address, raw, updated_at) FROM stdin;
476370066957403715	Bouwservice Douven	\N	info@bouwservicedouven.nl	0636166374	{"city": "Sittard", "street": "Engelenkampstraat 11", "country": "NL", "postcode": "6131JD"}	{"id": "476370066957403715", "city": "Sittard", "email": "info@bouwservicedouven.nl", "notes": [], "phone": "0636166374", "events": [{"data": {}, "action": "contact_created", "user_id": "474430462793614580", "created_at": "2026-01-16T00:05:19.820Z", "updated_at": "2026-01-16T00:05:19.820Z", "link_entity_id": null, "link_entity_type": null, "administration_id": "474430128158409973"}], "country": "NL", "version": 1768521919, "zipcode": "6131JD", "address1": "Engelenkampstraat 11", "address2": "", "archived": false, "lastname": null, "sepa_bic": "", "attention": "", "email_ubl": true, "firstname": null, "sepa_iban": "", "created_at": "2026-01-16T00:05:19.681Z", "is_trusted": false, "tax_number": "NL003546546B37", "updated_at": "2026-01-16T00:05:19.826Z", "customer_id": "3", "sepa_active": false, "bank_account": "", "company_name": "Bouwservice Douven", "custom_fields": [], "si_identifier": "", "contact_people": [{"id": "476370066982569590", "email": null, "phone": null, "version": 1768521919, "lastname": "Douven", "firstname": "Frank", "contact_id": "476370066957403715", "created_at": "2026-01-16T00:05:19.706Z", "department": null, "updated_at": "2026-01-16T00:05:19.706Z", "administration_id": "474430128158409973"}], "delivery_method": "Email", "sepa_mandate_id": "", "credit_card_type": null, "tax_number_valid": false, "administration_id": "474430128158409973", "sepa_mandate_date": null, "credit_card_number": "", "sales_invoices_url": "https://moneybird.com/474430128158409973/sales_invoices/f14bdd9d71b8efe1ececac96eb5b8fd9c0eaf2e1fe2e2aa040d847473ba9f6ba/all", "sepa_sequence_type": "RCUR", "si_identifier_type": null, "chamber_of_commerce": "90954182", "invoice_workflow_id": null, "max_transfer_amount": null, "estimate_workflow_id": null, "credit_card_reference": "", "send_invoices_to_email": "info@bouwservicedouven.nl", "sepa_iban_account_name": "", "send_estimates_to_email": "info@bouwservicedouven.nl", "tax_number_validated_at": "2026-01-16T00:05:19.823Z", "moneybird_payments_mandate": false, "send_invoices_to_attention": "", "send_estimates_to_attention": ""}	2026-02-24 00:27:48.195
474516820946060382	Bouwservice Douven	\N	info@bouwservicedouven.nl	+31636166374	{"city": "Sittard", "street": "Engelenkampstraat 11", "country": "NL", "postcode": "6131JD"}	{"id": "474516820946060382", "city": "Sittard", "email": "info@bouwservicedouven.nl", "notes": [], "phone": "+31636166374", "events": [{"data": {}, "action": "contact_created", "user_id": "474429872301671465", "created_at": "2025-12-26T13:08:46.698Z", "updated_at": "2025-12-26T13:08:46.698Z", "link_entity_id": null, "link_entity_type": null, "administration_id": "474430128158409973"}], "country": "NL", "version": 1766754527, "zipcode": "6131JD", "address1": "Engelenkampstraat 11", "address2": "", "archived": false, "lastname": null, "sepa_bic": "KNABNL2H", "attention": "", "email_ubl": true, "firstname": null, "sepa_iban": "NL62KNAB0616197497", "created_at": "2025-12-26T13:08:46.559Z", "is_trusted": false, "tax_number": "NL004857473B37", "updated_at": "2025-12-26T13:08:47.476Z", "customer_id": "1", "sepa_active": false, "bank_account": "NL62KNAB0616197497", "company_name": "Bouwservice Douven", "custom_fields": [], "si_identifier": "NL004857473B37", "contact_people": [{"id": "474516820968080480", "email": null, "phone": null, "version": 1766754526, "lastname": "Douven", "firstname": "Frank", "contact_id": "474516820946060382", "created_at": "2025-12-26T13:08:46.580Z", "department": null, "updated_at": "2025-12-26T13:08:46.580Z", "administration_id": "474430128158409973"}], "delivery_method": "Email", "sepa_mandate_id": "", "credit_card_type": null, "tax_number_valid": true, "administration_id": "474430128158409973", "sepa_mandate_date": null, "credit_card_number": "", "sales_invoices_url": "https://moneybird.com/474430128158409973/sales_invoices/aa8d3c61fbb2628b6296f4ea00673e2621cfdb1e1d86cd9fe1435046289c0be3/all", "sepa_sequence_type": "RCUR", "si_identifier_type": "NL:VAT", "chamber_of_commerce": "90982541", "invoice_workflow_id": null, "max_transfer_amount": null, "estimate_workflow_id": null, "credit_card_reference": "", "send_invoices_to_email": "info@bouwservicedouven.nl", "sepa_iban_account_name": "Bouwservice Douven", "send_estimates_to_email": "info@bouwservicedouven.nl", "tax_number_validated_at": "2025-12-26T13:08:47.473Z", "moneybird_payments_mandate": false, "send_invoices_to_attention": "", "send_estimates_to_attention": ""}	2026-02-24 00:27:48.166
476285874662802908	Bouwservice Douven	\N	info@bouwservicedouven.nl	0636166374	{"city": "Sittard", "street": "Engelenkampstraat 11", "country": "NL", "postcode": "6131JD"}	{"id": "476285874662802908", "city": "Sittard", "email": "info@bouwservicedouven.nl", "notes": [], "phone": "0636166374", "events": [{"data": {}, "action": "contact_created", "user_id": "474430462793614580", "created_at": "2026-01-15T01:47:07.812Z", "updated_at": "2026-01-15T01:47:07.812Z", "link_entity_id": null, "link_entity_type": null, "administration_id": "474430128158409973"}], "country": "NL", "version": 1768441631, "zipcode": "6131JD", "address1": "Engelenkampstraat 11", "address2": "", "archived": false, "lastname": null, "sepa_bic": "", "attention": "", "email_ubl": true, "firstname": null, "sepa_iban": "", "created_at": "2026-01-15T01:47:07.652Z", "is_trusted": false, "tax_number": "NL003546546B37", "updated_at": "2026-01-15T01:47:11.068Z", "customer_id": "2", "sepa_active": false, "bank_account": "", "company_name": "Bouwservice Douven", "custom_fields": [], "si_identifier": "", "contact_people": [{"id": "476285874692163043", "email": null, "phone": null, "version": 1768441627, "lastname": "Douven", "firstname": "Frank", "contact_id": "476285874662802908", "created_at": "2026-01-15T01:47:07.681Z", "department": null, "updated_at": "2026-01-15T01:47:07.681Z", "administration_id": "474430128158409973"}], "delivery_method": "Email", "sepa_mandate_id": "", "credit_card_type": null, "tax_number_valid": false, "administration_id": "474430128158409973", "sepa_mandate_date": null, "credit_card_number": "", "sales_invoices_url": "https://moneybird.com/474430128158409973/sales_invoices/14c0c43844c1f0bff8721a15cd64951c1580b88163dbe9e6ebfa9734d8ba2e87/all", "sepa_sequence_type": "RCUR", "si_identifier_type": null, "chamber_of_commerce": "90954182", "invoice_workflow_id": null, "max_transfer_amount": null, "estimate_workflow_id": null, "credit_card_reference": "", "send_invoices_to_email": "info@bouwservicedouven.nl", "sepa_iban_account_name": "", "send_estimates_to_email": "info@bouwservicedouven.nl", "tax_number_validated_at": "2026-01-15T01:47:11.065Z", "moneybird_payments_mandate": false, "send_invoices_to_attention": "", "send_estimates_to_attention": ""}	2026-02-24 00:27:48.185
\.


--
-- Data for Name: moneybird_invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.moneybird_invoices (id, moneybird_id, moneybird_contact_id, invoice_id, reference, invoice_date, due_date, state, total_price_excl_tax, total_price_incl_tax, total_unpaid, currency, paid_at, url, internal_invoice_id, last_synced_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: moneybird_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.moneybird_payments (id, moneybird_id, moneybird_invoice_id, payment_date, price, price_currency, last_synced_at, created_at) FROM stdin;
\.


--
-- Data for Name: monthly_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.monthly_reports (id, period_year, period_month, report_type, entity_id, entity_name, report_data, status, generated_at, sent_at, sent_to_email, error_message, created_at) FROM stdin;
\.


--
-- Data for Name: onboarding_checklists; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.onboarding_checklists (id, advertiser_id, status, completed_at, created_at, updated_at) FROM stdin;
472fc259-e221-4239-a49f-570938373890	c03e2782-5872-44a8-89cd-167a48edda1e	in_progress	\N	2025-12-17 18:07:13.626184	2025-12-17 18:07:13.626184
\.


--
-- Data for Name: onboarding_invite_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.onboarding_invite_tokens (id, token_hash, entity_type, entity_id, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: onboarding_tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.onboarding_tasks (id, checklist_id, task_type, status, owner_user_id, notes, due_date, completed_at, created_at, updated_at) FROM stdin;
656d7e92-a6bd-4728-8540-7a3def71ede8	472fc259-e221-4239-a49f-570938373890	creative_received	todo	\N	\N	\N	\N	2025-12-17 18:07:13.634138	2025-12-17 18:07:13.634138
05f80aab-a170-43ba-ac57-88847c33a98e	472fc259-e221-4239-a49f-570938373890	creative_approved	todo	\N	\N	\N	\N	2025-12-17 18:07:13.642156	2025-12-17 18:07:13.642156
30ed53f2-355f-4857-bd61-931bed89394a	472fc259-e221-4239-a49f-570938373890	campaign_created	todo	\N	\N	\N	\N	2025-12-17 18:07:13.646528	2025-12-17 18:07:13.646528
dcb63c74-74e4-421f-9a5f-35d37259682a	472fc259-e221-4239-a49f-570938373890	scheduled_on_screens	todo	\N	\N	\N	\N	2025-12-17 18:07:13.650434	2025-12-17 18:07:13.650434
278899a5-6c27-454d-98a9-375d1eebcff3	472fc259-e221-4239-a49f-570938373890	billing_configured	todo	\N	\N	\N	\N	2025-12-17 18:07:13.653982	2025-12-17 18:07:13.653982
b49aedf1-76ab-4570-903e-de8fa2a60b1f	472fc259-e221-4239-a49f-570938373890	first_invoice_sent	todo	\N	\N	\N	\N	2025-12-17 18:07:13.657955	2025-12-17 18:07:13.657955
f27e9906-38dc-4a06-8e9c-e8832ff863da	472fc259-e221-4239-a49f-570938373890	go_live_confirmed	todo	\N	\N	\N	\N	2025-12-17 18:07:13.660976	2025-12-17 18:07:13.660976
94a8b84a-38b3-452a-9140-839ebfb0be52	472fc259-e221-4239-a49f-570938373890	first_report_sent	todo	\N	\N	\N	\N	2025-12-17 18:07:13.664159	2025-12-17 18:07:13.664159
\.


--
-- Data for Name: package_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.package_plans (id, name, description, base_monthly_price_ex_vat, default_seconds_per_loop, default_plays_per_hour, is_active, created_at, updated_at) FROM stdin;
dc17e14b-6c96-4ba8-b5e7-80939c866c63	Basic	Single screen placement, 10 seconds per loop	250.00	10	6	t	2025-12-17 14:17:02.622155	2025-12-17 14:17:02.622155
ef05b576-aaeb-4e35-b8e1-cfb0b89529b3	Premium	Multiple screens, 15 seconds per loop, priority placement	500.00	15	10	t	2025-12-17 14:17:02.622155	2025-12-17 14:17:02.622155
79b0d9d3-849c-443f-8cf8-4e22e59515e4	Full Network	All screens across all locations, maximum exposure	1500.00	20	12	t	2025-12-17 14:17:02.622155	2025-12-17 14:17:02.622155
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payments (id, invoice_id, amount, payment_date, payment_method, moneybird_payment_id, reference, notes, created_at) FROM stdin;
\.


--
-- Data for Name: payouts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payouts (id, location_id, snapshot_id, period_start, period_end, gross_revenue_ex_vat, share_percent, payout_amount_ex_vat, carry_over_from_previous, total_due, status, paid_at, payment_reference, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: placement_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.placement_plans (id, advertiser_id, ad_asset_id, link_key, status, package_type, required_target_count, proposed_targets, approved_targets, simulation_report, publish_report, idempotency_key, simulated_at, approved_at, approved_by_user_id, published_at, failed_at, rolled_back_at, created_at, updated_at, retry_count, last_attempt_at, last_error_code, last_error_message, last_error_details) FROM stdin;
\.


--
-- Data for Name: placement_targets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.placement_targets (id, plan_id, location_id, yodeck_playlist_id, yodeck_media_id, yodeck_media_name, status, error_message, expected_impressions_per_week, score, published_at, rolled_back_at, created_at) FROM stdin;
\.


--
-- Data for Name: placements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.placements (id, contract_id, screen_id, source, seconds_per_loop, plays_per_hour, start_date, end_date, is_active, yodeck_playlist_id, notes, created_at, updated_at) FROM stdin;
3a2f2558-1b3c-4edc-9583-8a1f7d980e4c	d4323820-c28c-4bbe-b2b0-0f398f486d47	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	auto_targeting	10	6	\N	\N	t	\N	\N	2026-01-29 13:21:02.218758	2026-01-29 13:21:02.218758
8a2f0b97-18a7-41e6-b0fc-529001301a02	d4323820-c28c-4bbe-b2b0-0f398f486d47	639e565e-11dd-4618-9d67-809f820520eb	admin_force	10	6	\N	\N	t	\N	\N	2026-02-08 12:43:25.836533	2026-02-08 12:43:25.836533
dbca45fa-8fce-4fab-aab2-7b173f73f0f9	e9b988d6-23fd-4ecb-8c79-ee64abb1f6bb	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	publish_now_force	10	6	\N	\N	t	\N	\N	2026-02-10 15:51:00.385839	2026-02-10 15:51:00.385839
296d2956-8d96-48f5-9a1c-63ca02c3c6b3	e9b988d6-23fd-4ecb-8c79-ee64abb1f6bb	639e565e-11dd-4618-9d67-809f820520eb	publish_now_force	10	6	\N	\N	t	\N	\N	2026-02-10 15:51:00.392647	2026-02-10 15:51:00.392647
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.plans (id, code, name, max_screens, created_at, price_monthly_cents, min_commit_months) FROM stdin;
377eb4ce-bb8d-489f-b1ee-feed53d29f3a	PLAN_1	Starter	1	2026-02-12 00:59:12.165339	4999	3
ed262c76-224a-4c14-aafe-ac7d58e600f7	PLAN_3	Local Plus	3	2026-02-12 00:59:12.165339	12999	3
d6d96590-25ae-42e8-949d-27454fc368aa	PLAN_10	Premium	10	2026-02-12 00:59:12.165339	29999	3
\.


--
-- Data for Name: portal_placements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.portal_placements (id, advertiser_id, screen_id, status, created_at, updated_at, approved_at, live_at, paused_at, removed_at, last_reason) FROM stdin;
\.


--
-- Data for Name: portal_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.portal_tokens (id, advertiser_id, token_hash, expires_at, used_at, created_at, token_ciphertext) FROM stdin;
85323925-084b-40a7-a8e9-b1313b36b0e2	cd794287-b67a-46dd-a7c3-db41bd9bae1e	41f5557433d56a30603dcad4683927d5d71ea235e8998eaf0ee11850144a2b5d	2026-01-09 14:21:02.527	\N	2026-01-02 14:21:02.528587	\N
46b51701-0ff7-48a1-bc90-e4e126850e44	fc022fe3-11c7-4ad3-adf4-9327b900cc8e	ecbfefd3db06d311f89d540393e694b53bd002bcf6dc9505ebf2f8b897987ed6	2026-01-09 14:24:11.63	2026-01-02 14:24:36.718	2026-01-02 14:24:11.630864	\N
013bd4f8-77c2-4235-a4c2-3568d97f0ef4	2c8eb929-c1dc-4e06-b215-d525727929da	5df6883f1a31414349095ead76b8facd21d9beb9bd421773a630a61daab4d2a3	2026-01-28 01:17:49.202	\N	2026-01-14 01:17:49.203535	\N
296f1ff6-1ae7-49fd-8079-92e202b5eb33	0f9f4bd6-066d-4dcc-abcd-8257e416a67a	6d28dba15ee0257fd49dbd41f35cf780690395e0bbabbe1fb69aa5291e1d380c	2026-01-29 01:47:07.034	\N	2026-01-15 01:47:07.036008	\N
\.


--
-- Data for Name: portal_user_screen_selections; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.portal_user_screen_selections (id, portal_user_id, screen_id, created_at) FROM stdin;
\.


--
-- Data for Name: portal_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.portal_users (id, email, password_hash, email_verified_at, verify_token_hash, verify_token_expires_at, change_email_token_hash, change_email_token_expires_at, pending_email, company_name, contact_name, phone, kvk, vat, address, plan_code, onboarding_complete, advertiser_id, created_at, updated_at) FROM stdin;
b0db7d20-e27d-4089-a850-b01f8b006379	test-dvnluz@example.com	$2b$10$v6d9J/ZkxSjj.v0N1Uzbwe./8LITyltuDsUFRvKkxyV9vnTsTTyeK	\N	b887240981c6b05f72d2ffdefd3830afebb049623b3638bd322b6221a1ba3263	2026-02-13 02:29:59.368	\N	\N	\N	TestBedrijf	\N	\N	\N	\N	\N	\N	f	\N	2026-02-12 02:29:59.370398	2026-02-12 02:29:59.370398
\.


--
-- Data for Name: report_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.report_logs (id, advertiser_id, period_key, live_locations_count, estimated_visitors, estimated_impressions, regions_label, status, error_message, created_at, sent_at) FROM stdin;
\.


--
-- Data for Name: report_metrics; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.report_metrics (id, report_id, screen_id, location_id, scheduled_plays_estimate, scheduled_seconds_estimate, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reports (id, advertiser_id, report_type, period_start, period_end, pdf_url, generated_at, sent_at, notes, created_at) FROM stdin;
\.


--
-- Data for Name: revenue_allocations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.revenue_allocations (id, period_year, period_month, advertiser_id, screen_id, location_id, screen_days, visitor_weight, weight_override, allocation_score, total_score_for_advertiser, advertiser_revenue_month, allocated_revenue, moneybird_invoice_ids, calculated_at, created_at) FROM stdin;
\.


--
-- Data for Name: sales_activities; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales_activities (id, lead_id, activity_type, description, outcome, next_action, next_action_date, performed_by_user_id, created_at) FROM stdin;
\.


--
-- Data for Name: schedule_snapshots; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schedule_snapshots (id, period_year, period_month, status, total_revenue, total_weight, generated_at, locked_at, locked_by_job_id, notes, created_at) FROM stdin;
26f37670-fa42-4124-b571-41f937439ad6	2025	12	draft	250.00	1860.00	2025-12-17 23:58:24.481144	\N	\N	{"frozenContracts":[{"id":"b7f2f316-fd94-4a9d-aab5-502697c18a37","name":"Fresh Bakery 2025","advertiserId":"27ec0342-1652-4335-846d-e484214ebf17","advertiserName":"Fresh Bakery","monthlyPriceExVat":"250.00","vatPercent":"21.00","billingCycle":"monthly"}],"frozenLocations":[{"id":"a7407806-477f-4095-b3d8-c523ddec9d9c","name":"Central Mall","revenueSharePercent":"10.00","minimumPayoutAmount":"25.00"},{"id":"59cdcc29-e6c8-4bc4-b5e9-a8ac50d13141","name":"Airport Terminal 1","revenueSharePercent":"15.00","minimumPayoutAmount":"50.00"},{"id":"76142c5b-991b-4683-8480-bff5124fb7e1","name":"Train Station Central","revenueSharePercent":"12.00","minimumPayoutAmount":"30.00"}],"frozenCarryOvers":[],"frozenTotalRevenue":"250.00","createdAt":"2025-12-17T23:58:24.478Z"}	2025-12-17 23:58:24.481144
\.


--
-- Data for Name: screen_content_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.screen_content_items (id, screen_id, yodeck_media_id, name, media_type, category, duration, is_active, linked_advertiser_id, linked_placement_id, detected_at, last_seen_at) FROM stdin;
795a5362-351c-4078-8986-926cd80b6304	639e565e-11dd-4618-9d67-809f820520eb	26703349	See your business grow	media	ad	-1	f	\N	\N	2025-12-24 20:58:18.410049	2026-01-28 01:27:49.66
51e5f37d-fe78-422a-a4b9-4f381678ca62	639e565e-11dd-4618-9d67-809f820520eb	27478775	NOS opmerkelijk	media	non_ad	20	f	\N	\N	2026-01-30 22:40:51.981105	2026-02-09 17:31:02.49
441282e2-2982-47d6-a825-1a530bbedc49	639e565e-11dd-4618-9d67-809f820520eb	26476034	Sample Sales Sign	media	ad	5	f	\N	\N	2025-12-24 20:58:18.4371	2026-01-28 01:27:49.66
317db9d9-8bc5-4a02-bfeb-062c2a690fc5	639e565e-11dd-4618-9d67-809f820520eb	26476033	Sample Coupons Video	media	ad	-1	f	\N	\N	2025-12-24 20:58:18.466639	2026-01-28 01:27:49.66
5325307e-02df-4c54-b6b2-4fa9557c8d64	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	29661498	ADV-BOUWSERVICEDOUVEN-756846.mp4	media	ad	15	f	\N	\N	2026-01-31 09:12:05.46725	2026-01-31 09:53:13.457
e1187a33-ebb2-4572-8d82-6af7cef6e8fc	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	27478716	1Limburg	media	non_ad	10	f	\N	\N	2026-01-28 15:14:26.709362	2026-02-11 23:55:40.111
383cdf82-26e5-47f5-89d9-21cd162e2dfc	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	29881336	ADV-BOUWSERVICEDOUVEN-ADV-BOUW-202602051247.mp4	media	ad	15	t	\N	\N	2026-02-10 15:22:03.712471	2026-02-24 00:22:45.014
45939958-9ae8-4ccf-a404-ab433a37ba7b	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	29378800	ADV-BOUWSERVICEDOUVEN-756846_Header Frontpage(2).mp4	media	ad	5	f	\N	\N	2026-01-29 14:27:55.601581	2026-01-29 16:37:06.883
f0fdb287-71f6-479e-b8fb-02bc187b59da	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	29893553	EVZ-PURE-29893461.mp4	media	ad	15	f	\N	\N	2026-02-08 15:23:25.410671	2026-02-11 23:55:40.111
a4e05a5a-916f-442c-b50e-7386eff3e083	639e565e-11dd-4618-9d67-809f820520eb	27476083	NOS algemeen nieuws	media	non_ad	30	t	\N	\N	2025-12-24 20:58:18.450608	2026-02-24 00:22:45.171
7b288739-77a6-4901-ad9f-578ae935b393	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	29860650	EVZ-AD-3941d02f.mp4	media	ad	15	f	\N	\N	2026-02-06 16:46:15.63845	2026-02-07 05:20:10.804
a0ba6919-351f-424c-909a-4ab65a3b0e1f	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	29893421	EVZ-PURE-29892561.mp4	media	ad	15	f	\N	\N	2026-02-08 15:00:33.311278	2026-02-08 15:23:25.414
67a3910a-783b-48e0-8629-d13631d4ceca	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	29408113	ADV-BOUWSERVICEDOUVEN-756846_Header Frontpage(2).mp4	media	ad	5	f	\N	\N	2026-01-28 01:27:49.623691	2026-01-29 16:37:06.883
0d2eeb2f-ab91-42ef-aa1d-c9b10d37c86b	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	29889127	EVZ-AD-3941d02f.mp4	media	ad	15	f	\N	\N	2026-02-08 03:12:13.943529	2026-02-08 03:23:09.813
55eb9692-d372-4693-bcd0-dbaefc5cb694	639e565e-11dd-4618-9d67-809f820520eb	29378800	ADV-BOUWSERVICEDOUVEN-756846_Header Frontpage(2).mp4	media	ad	5	f	\N	\N	2026-01-29 14:27:55.990428	2026-01-29 16:37:07.088
6222c0f4-87ae-4207-af44-7fd05ad36225	639e565e-11dd-4618-9d67-809f820520eb	29408113	ADV-BOUWSERVICEDOUVEN-756846_Header Frontpage(2).mp4	media	ad	5	f	\N	\N	2026-01-28 01:27:49.624241	2026-01-29 16:37:07.088
44db8d36-4645-47c7-accf-c1e2d6cb4cc3	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	29881729	ADV-BOUWSERVICEDOUVEN-ADV-BOUW-202602051247.mp4	media	ad	15	f	\N	\N	2026-02-08 12:58:24.967157	2026-02-08 13:34:59.366
c4b92ad2-cf02-43fb-b5d7-1f23f98572d4	639e565e-11dd-4618-9d67-809f820520eb	27478716	1Limburg	media	non_ad	10	f	\N	\N	2026-01-28 15:14:26.882507	2026-02-11 23:55:40.119
42506747-0562-4a1b-b929-868735d9fb73	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	30148692	ADV-HOI-75BF95_Testvideo 2.mp4	media	ad	15	t	\N	\N	2026-02-18 01:05:00.934935	2026-02-24 00:22:45.03
78a58d6f-46ce-4194-8264-d4a1ad11a97b	639e565e-11dd-4618-9d67-809f820520eb	29860650	EVZ-AD-3941d02f.mp4	media	ad	15	f	\N	\N	2026-02-06 16:46:15.835776	2026-02-07 16:00:58.809
2c7f1c0d-d553-4650-be69-9bc818780053	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	26703349	See your business grow	media	ad	-1	f	\N	\N	2025-12-24 20:58:18.304248	2026-01-28 01:27:49.657
2a6974bc-b8fb-4ed9-b2e5-5a21d8102349	639e565e-11dd-4618-9d67-809f820520eb	29881336	ADV-BOUWSERVICEDOUVEN-ADV-BOUW-202602051247.mp4	media	ad	15	t	\N	\N	2026-02-10 15:22:03.741634	2026-02-24 00:22:45.298
f25faa3d-48c5-44a4-aa93-d7d5dab46008	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	26476034	Sample Sales Sign	media	ad	5	f	\N	\N	2025-12-24 20:58:18.338807	2026-01-28 01:27:49.657
0112d5d6-78cd-4204-9188-d56f9cbc885b	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	26476033	Sample Coupons Video	media	ad	-1	f	\N	\N	2025-12-24 20:58:18.378261	2026-01-28 01:27:49.657
3939925f-ace3-4abe-93d4-943e8dbd33e6	639e565e-11dd-4618-9d67-809f820520eb	29893553	EVZ-PURE-29893461.mp4	media	ad	15	f	\N	\N	2026-02-11 00:51:55.252417	2026-02-11 23:55:40.119
e202fc77-048b-4fa9-a3d2-50fea1106f1e	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	29892561	EVZ-PURE-29892530.mp4	media	ad	15	f	\N	\N	2026-02-08 13:34:59.364458	2026-02-08 15:00:33.316
74fd4abe-6df6-4b74-8e3c-01716e0fc4dc	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	29975064	Elevizion promo 1	media	ad	24	t	\N	\N	2026-02-11 11:22:02.282473	2026-02-24 00:22:44.957
1bc96f48-1a45-4dc0-8387-38277433e228	639e565e-11dd-4618-9d67-809f820520eb	29975064	Elevizion promo 1	media	ad	24	t	\N	\N	2026-02-11 11:22:02.47803	2026-02-24 00:22:45.122
d559d21b-89ca-40b8-90db-dc471c1e890c	639e565e-11dd-4618-9d67-809f820520eb	29881729	ADV-BOUWSERVICEDOUVEN-ADV-BOUW-202602051247.mp4	media	ad	15	f	\N	\N	2026-02-08 12:58:25.104775	2026-02-08 13:34:59.621
55135544-88da-4caa-b30a-1d02d8b530f2	639e565e-11dd-4618-9d67-809f820520eb	27476141	NOS sport algemeen	media	non_ad	30	t	\N	\N	2025-12-24 20:58:18.397536	2026-02-24 00:22:45.136
0de49df6-0834-4891-ba5e-38738add82b1	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	27476141	NOS sport algemeen	media	non_ad	30	t	\N	\N	2025-12-24 20:58:18.280735	2026-02-24 00:22:44.971
2538f651-c78a-4e3b-b759-9c3f48475998	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	27477130	Weer goed	media	non_ad	15	t	\N	\N	2025-12-24 20:58:18.321789	2026-02-24 00:22:44.983
46b7577c-0437-4a9a-a5ba-8b286babb56a	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	27476083	NOS algemeen nieuws	media	non_ad	30	t	\N	\N	2025-12-24 20:58:18.362773	2026-02-24 00:22:45
8c0af74b-c5b6-47ef-a559-dd19a3f48387	2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	27478775	NOS opmerkelijk	media	non_ad	20	f	\N	\N	2026-01-30 22:07:42.114772	2026-02-09 17:31:02.47
20e5a5c7-b273-490c-b8dc-7dd390d9fb6d	639e565e-11dd-4618-9d67-809f820520eb	27477130	Weer goed	media	non_ad	15	t	\N	\N	2025-12-24 20:58:18.42386	2026-02-24 00:22:45.153
1517d2e8-c8bc-4918-9720-de86d0fd5433	639e565e-11dd-4618-9d67-809f820520eb	30148692	ADV-HOI-75BF95_Testvideo 2.mp4	media	ad	15	t	\N	\N	2026-02-17 17:08:44.188681	2026-02-24 00:22:45.318
\.


--
-- Data for Name: screen_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.screen_groups (id, name, description, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: screen_leads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.screen_leads (id, business_type, city, company_name, contact_name, phone, email, visitors_per_week, remarks, status, created_at, inferred_category, final_category) FROM stdin;
\.


--
-- Data for Name: screens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.screens (id, location_id, name, yodeck_player_id, yodeck_player_name, resolution, orientation, status, last_seen_at, is_active, notes, created_at, updated_at, screen_id, group_id, yodeck_uuid, yodeck_workspace_name, yodeck_screenshot_url, yodeck_content_count, yodeck_content_summary, yodeck_content_last_fetched_at, yodeck_content_status, yodeck_screenshot_last_ok_at, yodeck_screenshot_byte_size, yodeck_content_error, yodeck_screenshot_hash, match_confidence, match_reason, moneybird_contact_id, moneybird_sync_status, effective_name, moneybird_contact_snapshot, location_group_id, is_multi_screen_location, city, onboarding_status, moneybird_sync_error, moneybird_last_sync_at, yodeck_sync_status, yodeck_sync_error, yodeck_last_sync_at, playlist_id, playlist_name, last_push_at, last_push_result, last_push_error, last_verify_at, last_verify_result, last_verify_error, baseline_playlist_id, baseline_playlist_name, ads_playlist_id, ads_playlist_name, combined_playlist_id, combined_playlist_name, playback_mode) FROM stdin;
2956f9a3-48d3-49b5-9bfe-d8b5f3d9011e	16b5c6b8-bd41-4a64-9445-1f657489f05f	Bouwservice Douven, Sittard	591896	Test	\N	landscape	online	2025-12-23 00:27:39.571	t	\N	2025-12-22 17:33:16.789707	2026-02-24 00:22:45.035	YDK-591896	\N	872d34ea-52cc-413f-a539-10cc0dad0a24	\N	https://dsbackend.s3.amazonaws.com/screenshots/872d34ea52cc413fa53910cc0dad0a24.png	6	{"items": [{"id": 30590180, "name": "EVZ | SCREEN | 591896(auto-playlist-30590180-crop)", "type": "playlist"}], "mediaIds": [29975064, 27476141, 27477130, 27476083, 29881336, 30148692], "sourceId": 30590180, "topItems": ["media: Elevizion promo 1", "media: NOS sport algemeen", "media: Weer goed", "media: NOS algemeen nieuws", "media: ADV-BOUWSERVICEDOUVEN-ADV-BOUW-202602051247.mp4"], "mediaItems": [{"id": 29975064, "name": "Elevizion promo 1", "type": "media", "category": "ad", "duration": 24}, {"id": 27476141, "name": "NOS sport algemeen", "type": "media", "category": "non_ad", "duration": 30}, {"id": 27477130, "name": "Weer goed", "type": "media", "category": "non_ad", "duration": 15}, {"id": 27476083, "name": "NOS algemeen nieuws", "type": "media", "category": "non_ad", "duration": 30}, {"id": 29881336, "name": "ADV-BOUWSERVICEDOUVEN-ADV-BOUW-202602051247.mp4", "type": "media", "category": "ad", "duration": 15}, {"id": 30148692, "name": "ADV-HOI-75BF95_Testvideo 2.mp4", "type": "media", "category": "ad", "duration": 15}], "sourceName": "EVZ | SCREEN | 591896(auto-playlist-30590180-crop)", "sourceType": "playlist", "lastFetchedAt": "2026-02-24T00:22:45.035Z", "uniqueMediaCount": 6}	2026-02-24 00:22:45.035	has_content	2026-01-28 15:59:30.653	7704	\N	759c9dabcdc0bbc962d57b863ccebdf7b0df17e1f4aa137f78fd849534a24da5	\N	\N	474516820946060382	linked	Bouwservice Douven	{"city": "Sittard", "email": "info@bouwservicedouven.nl", "phone": "+31636166374", "country": "NL", "zipcode": "6131JD", "address1": "Engelenkampstraat 11", "address2": null, "lastname": null, "syncedAt": "2025-12-30T16:45:22.114Z", "firstname": null, "taxNumber": "NL004857473B37", "companyName": "Bouwservice Douven", "chamberOfCommerce": "90982541"}	\N	f	Sittard	draft	\N	\N	synced	\N	\N	30590180	EVZ | COMBINED | SCREEN | 591896(auto-playlist-30588132-crop)	2026-02-11 23:39:37.923	ok	\N	2026-02-11 23:39:39.256	ok	\N	\N	\N	\N	\N	\N	\N	playlist
639e565e-11dd-4618-9d67-809f820520eb	2d90dbc4-ea08-463e-84cf-13a8023a93dc	Basil's Barber Shop Maasbracht	591895	Basil's Barber Shop Maasbracht	\N	landscape	online	2025-11-06 22:33:01	t	\N	2025-12-22 17:33:16.779183	2026-02-24 00:22:45.324	YDK-591895	\N	441bd11e-e91b-4ed4-b5d3-290b9664cda6	\N	https://dsbackend.s3.amazonaws.com/screenshots/441bd11ee91b4ed4b5d3290b9664cda6.png	6	{"items": [{"id": 30590872, "name": "EVZ | SCREEN | 591895(auto-playlist-30590872-crop)", "type": "playlist"}], "mediaIds": [29975064, 27476141, 27477130, 27476083, 29881336, 30148692], "sourceId": 30590872, "topItems": ["media: Elevizion promo 1", "media: NOS sport algemeen", "media: Weer goed", "media: NOS algemeen nieuws", "media: ADV-BOUWSERVICEDOUVEN-ADV-BOUW-202602051247.mp4"], "mediaItems": [{"id": 29975064, "name": "Elevizion promo 1", "type": "media", "category": "ad", "duration": 24}, {"id": 27476141, "name": "NOS sport algemeen", "type": "media", "category": "non_ad", "duration": 30}, {"id": 27477130, "name": "Weer goed", "type": "media", "category": "non_ad", "duration": 15}, {"id": 27476083, "name": "NOS algemeen nieuws", "type": "media", "category": "non_ad", "duration": 30}, {"id": 29881336, "name": "ADV-BOUWSERVICEDOUVEN-ADV-BOUW-202602051247.mp4", "type": "media", "category": "ad", "duration": 15}, {"id": 30148692, "name": "ADV-HOI-75BF95_Testvideo 2.mp4", "type": "media", "category": "ad", "duration": 15}], "sourceName": "EVZ | SCREEN | 591895(auto-playlist-30590872-crop)", "sourceType": "playlist", "lastFetchedAt": "2026-02-24T00:22:45.324Z", "uniqueMediaCount": 6}	2026-02-24 00:22:45.324	has_content	\N	\N	\N	\N	\N	\N	\N	not_linked	\N	\N	\N	f	\N	draft	\N	\N	synced	\N	\N	30590872	EVZ | SCREEN | 591895	2026-02-11 23:39:35.313	ok	\N	2026-02-11 23:39:36.648	ok	\N	\N	\N	\N	\N	\N	\N	playlist
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sessions (sid, sess, expire) FROM stdin;
d5fvZAlsbYqgAYuL-sA6B4J15397miyz	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:26:00.241Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:26:03
qjTZndPZ6Gzu2Y1WvIXcI9UKsK5NxUjk	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-14T16:21:11.511Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-14 16:21:13
R02QbXMcpMmYOLSyS2m7hZTc4OqNBFn6	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T14:22:12.837Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 14:22:37
4ej60mB9XVewwKZ0MyxF7as3zDt-3_OY	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T15:23:06.751Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 15:23:07
RrV1EBmsX3yT94iSUQTc-L7KiTXlcz3_	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T03:20:00.504Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 03:20:54
yBqTfwo4MR0J5iiJ4_2L46ninhVA917m	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-16T17:15:37.491Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-16 17:16:32
5jSmyoh9mgKm0kPgdRnd19-40vOv_NVI	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-16T23:00:41.680Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-16 23:00:44
H00JrhdBcWmh_d7BG1XsNa44Y1XE8gX0	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T13:31:08.483Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 13:31:44
DONwAIBAa_VsJLkYK_HI9DuVucGmXtsE	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T00:13:12.673Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 00:13:13
cTgjb27PY_ZWv4Xxti6mvrYn17VnCakR	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T13:59:46.134Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 14:00:00
sKQsDpEMhR4lqub4WxdEVFic8mFnbMGp	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T14:16:08.204Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 14:17:12
FCCqt4Uyt_jrqyF4CrByp9dCtpx2ft8M	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:54:24.344Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:54:25
Mg7JNkOpPKReAEok1PvOqtYzPJebL3vQ	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-19T15:28:54.901Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-19 15:29:12
17_4tXeu-MoXghf5YOjeW-DYnly60W8U	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-18T00:22:23.167Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-18 00:23:27
QONVK1n2xPVWNsmECBVrfL0qeqTztwCn	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-18T01:17:15.510Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-18 01:18:00
rInGQ9z7KMAm1InnPDVQUwdMVNRnjTli	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-18T11:04:57.691Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-18 11:06:28
KgjpcY6gySlvU15BM8D2VlDQUIGAqejB	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-18T23:39:01.513Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-18 23:40:05
RffMZdX4L2DaG4oPl71PC14pZBAvxhnW	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T14:45:31.466Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 14:45:34
TKJ0kPn7PAzkxdvmsJc61orKOgeItCo0	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T15:24:22.198Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 15:24:23
DQIjQPYS8cf0YaIlfiupkLMe7bES7TXx	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-14T16:21:23.605Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-14 16:21:26
CBuVIWDaQa_Qf7yOhaF0k8vL_bnfmOl4	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-16T22:07:30.895Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-16 22:07:33
otnkusMyqRWw3XOtkPnflWV98VQq3NTY	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T03:23:24.126Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 03:23:34
lgTZYcvYrrmStQwgQCCqoFxsDSX_p0Ex	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-16T23:18:23.039Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-16 23:18:25
h05gowsG1MBag1CTXVjt2smz6yGTnFYq	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T00:13:27.102Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 00:13:28
wDo-pkI7mM3OLlYdh-tfa_GUdRjwLs-1	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-19T01:13:26.795Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "portalAdvertiserId": null}	2026-02-19 01:13:59
-mouw0GY9QlLbaw_wBwWy8vMu2XhwDoQ	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T13:34:43.492Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 13:35:42
gmhk4UmLAQAEmfmP8ZdbXEV_AWFgVMy8	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T14:18:25.779Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 14:18:37
iUZinIXgh877nhKV6pqWuaijKK7tZNBu	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:28:58.794Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:29:00
ubRQZ61q1aTqik1AuBn_h3xsBfH2D0sS	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-19T15:31:24.514Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-19 15:31:25
QCU5P41pujnJsOSM01EskB7hclMwhVsu	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:57:57.468Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:58:34
oDFmbiLVcmrfAXoZPIFmeNz4SA3pfj_O	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-18T00:25:20.895Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-18 00:25:25
IoCugL06juChm90lYpYaeWGnOk9tgQnO	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-19T01:07:17.437Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "portalAdvertiserId": "e80e89d3-5893-4bc3-88cb-7042de798354"}	2026-02-19 01:07:18
RkF1UOA330PG9t8HBO-Z2wodVF47QNIM	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-14T16:22:19.949Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-14 16:22:22
EyYJ3wKgX_HgxFVscNQJxYt_3fHxoQGC	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T15:00:17.053Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 15:00:25
rVk3DyBuGLvxICKWQeuKFj_ntj-DxEci	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T15:40:46.943Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 15:40:47
h8Cb29vIz1-mm5cE06fgj-2L3oZ5uMyv	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-16T22:07:53.830Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-16 22:07:56
UYCHcnQK83XFgEkwvcmUZs1UtNYYuOWF	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T12:43:11.273Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 12:43:50
1ADzn4Ag-ytbzmwkDokR0xi-2MqfLnQ0	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-16T23:29:17.319Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-16 23:29:20
5ryu8sYruQqVA8c2tKt0Jc0L_PPDyg67	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T13:36:30.940Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 13:36:43
mB1bMd-Z7mXv7aodf_vCpU56Hsy5T96w	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T00:20:39.820Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 00:20:42
d0c_-o497XhenpqlHHb-TnTYHAtoBWgz	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-19T15:09:45.011Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-19 15:09:53
wsbyc4iSGswMqKo3zjDKYIpVnIX65Sdc	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:07:13.272Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:07:15
kIHB1qso9CN8pw_nmQd9OfluizT9HWX-	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:07:21.456Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:07:23
CqM2Ftk77Eb_RsxARTR5bgG7a23EI7va	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:07:31.690Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:07:32
DqYvlt5yYWh0jn3fZQIWTdE8bmkXHvDA	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:50:42.446Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:50:43
Ot0RVrSMFNJuSV26cjx4PDGA0JSBKUtN	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:50:51.287Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:50:52
hS3rg_rOdurUq708tFSv4qLKeDSWNA4s	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:51:00.054Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:51:01
6r0RGeCkL1WGUdnsbOpuUPjbD7dBC26T	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-19T15:32:42.037Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-19 15:32:43
_clCQoKfHEaBfggotjhMp45w8RgPZPKG	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-18T00:32:59.541Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-18 00:33:30
0dT1jHbULmAnd0oXGURsvzrUje7RavjM	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-19T01:49:07.603Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "portalAdvertiserId": null}	2026-02-19 01:49:27
gRT-GVAKCax4smYTPRgjQt1VcqBQ1h1g	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-14T16:23:09.881Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-14 16:23:11
BqUPNPuZXG7iXHm0oLXKcQjvwsAHDL7F	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T15:07:45.262Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 15:08:16
_Na38PIMJtabejknpveqeGenLVSUCQxg	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T15:42:03.660Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 15:42:04
UoISVsszGacLQlMkiTPTObzOKUw-w3ZK	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T13:27:42.706Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 13:28:48
8p6HdDpyEK4xH9_y3wT9EycCtJMGE8rq	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-16T22:23:28.976Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-16 22:23:31
V3qWgK8Sn49Z0cnHglPgfRldzv8CdPTV	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T13:37:43.668Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 13:37:54
pnHWOzFdFu6YcF1v5mWAZCpxEEubYvLk	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-16T23:43:54.559Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-16 23:43:55
hwSsdDbz3KdN_rHONX2PgqwK7RNQY81Q	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T00:30:20.624Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 00:30:22
ivte7Ja3HzsBDqf2rRRIuZ4Pkj4lmeyc	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:07:51.811Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:07:54
ExE21BXX4oNkAQ3D-E9zc04g5rvF21q0	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:51:38.979Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:51:40
Y2OiPvUOXr5E7zTsAl41R-Ew9yvS0pgK	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-18T00:34:59.967Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-18 00:35:03
BeNgVBfnZpjHbc46YsNp1jdsTfme4afi	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-19T01:10:32.269Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "portalAdvertiserId": null}	2026-02-19 01:10:52
Ri-6VskZlsNaTyeUGEERi1g27ZvHQRnC	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T15:10:14.727Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 15:10:17
9UmxpnyZRRM4qQWjas4XnTvlt9vcVgP8	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-14T16:55:50.553Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-14 16:56:07
FFGM5vZNiPKKBmfW29Etcse-mfZ-Pafn	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-16T23:00:26.011Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-16 23:00:28
Ib8Yq3Rzx-pitU4y7VfeOgEgfNN9u3Dp	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T13:30:06.642Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 13:30:21
bKhkKVXdWgfp39hS2bJXEufWiCmZt4sM	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-19T15:17:11.490Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-19 15:17:12
ZB0AV3qkPczO7sbsZKLVN0CAqxegQeZV	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-16T23:45:36.175Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-16 23:45:37
18o_aNTIuR2F2y12FGZvr1fcXt5fzeNP	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-15T13:49:59.638Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-15 13:50:22
fCwXbz5mMI8J-ScWWe5deW5pFZsoY1zX	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-19T23:21:57.759Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-19 23:21:58
7Psi9pTPudWlN4maPXcElzYRCene5wuX	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T13:40:29.335Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 13:40:36
UM1P-pXnXsWJg-UdUCu133zWtu3J18I7	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:08:19.240Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:08:21
DZp_r_maixg5eKk8w6giPWT_DyR1A86r	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-17T15:51:49.410Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-17 15:51:50
ZBKG-VI2E2oxHjPSTttJcZxUDQeGI0qa	{"cookie": {"path": "/", "secure": false, "expires": "2026-02-19T23:22:03.659Z", "httpOnly": true, "sameSite": "strict", "originalMaxAge": 604800000}, "userId": "51472361"}	2026-02-19 23:57:19
\.


--
-- Data for Name: site_contact_snapshot; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.site_contact_snapshot (id, site_id, company_name, contact_name, email, phone, address1, address2, postcode, city, country, vat_number, kvk_number, raw_moneybird, synced_at) FROM stdin;
\.


--
-- Data for Name: site_yodeck_snapshot; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.site_yodeck_snapshot (id, site_id, screen_name, status, last_seen, screenshot_url, content_status, content_count, raw_yodeck, synced_at) FROM stdin;
\.


--
-- Data for Name: sites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sites (id, code, display_name, moneybird_contact_id, yodeck_screen_id, multi_screen, status, notes, created_at, updated_at, yodeck_tags, sync_status, sync_error, last_sync_at) FROM stdin;
\.


--
-- Data for Name: snapshot_placements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.snapshot_placements (id, snapshot_id, placement_id, contract_id, screen_id, location_id, advertiser_id, seconds_per_loop, plays_per_hour, days_active, weight, revenue_share, created_at) FROM stdin;
\.


--
-- Data for Name: supply_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.supply_items (id, name, category, description, default_price, unit, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: survey_photos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.survey_photos (id, survey_id, storage_path, filename, description, uploaded_by_user_id, created_at, category) FROM stdin;
\.


--
-- Data for Name: survey_supplies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.survey_supplies (id, survey_id, supply_item_id, custom_name, quantity, notes, estimated_price, created_at) FROM stdin;
2e28ce63-6899-471c-a67c-b09edbaf79da	9e9f0d73-1ba7-4ca5-a2e4-8b800d213b55	\N	TV 55 inch	2	\N	\N	2025-12-18 16:34:50.945843
5d11483d-a5a3-49e5-88b2-be0afb991a38	9e9f0d73-1ba7-4ca5-a2e4-8b800d213b55	\N	HDMI kabel 3m	4	\N	\N	2025-12-18 16:35:00.203876
\.


--
-- Data for Name: sync_jobs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sync_jobs (id, entity_id, provider, action, status, error_message, payload, started_at, finished_at) FROM stdin;
\.


--
-- Data for Name: sync_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sync_logs (id, sync_type, status, items_processed, items_created, items_updated, error_message, started_at, completed_at, created_at) FROM stdin;
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_settings (id, key, value, description, category, updated_at, updated_by) FROM stdin;
8ce43d8c-5280-4364-b6cd-adf1dd8de8a8	reportWeeksPerMonth	4.33	Aantal weken per maand voor rapportage berekeningen	reporting	2026-01-14 13:27:28.925762	\N
cdbe9c93-d3aa-497c-a739-359a3c7c0bdc	reportViewFactor	2.5	Vermenigvuldigingsfactor voor impressies (bezoekers × factor)	reporting	2026-01-14 13:27:28.925762	\N
5d22f0c9-771e-41c5-a3da-c7d44c07c17b	maxVisitorsPerWeek	50000	Maximale bezoekers per week per locatie (sanity cap)	reporting	2026-01-14 13:27:28.925762	\N
19fe2f25-d685-45b4-bae4-3e2e2f8bad5c	yodeck.layout.adsRegion.7694728	1	ADS region ID for Yodeck layout 7694728	yodeck	2026-01-27 08:23:22.818385	\N
1f9c9d74-93ee-4d1c-825a-aa730fe65b17	autopilot.basePlaylistId	30449618	Base playlist ID for combined playlist autopilot	autopilot	2026-01-28 01:12:51.104683	\N
39fb65d4-9984-43ed-bd2b-06adddb9c570	autopilot.baseTemplatePlaylistId	30491569	Base TEMPLATE playlist ID - items are copied to per-location baseline playlists	autopilot	2026-01-28 01:40:27.833996	\N
d4ec8290-7265-4910-bb8a-3fad6aca82f5	autopilot.baselinePlaylistId	30400683	Yodeck baseline playlist ID (news/weather/etc)	general	2026-01-28 15:01:53.570634	\N
\.


--
-- Data for Name: tag_policies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tag_policies (id, tag_name, tag_type, description, is_active, requires_yodeck_creation, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: task_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_attachments (id, task_id, filename, storage_path, file_type, uploaded_by_user_id, created_at) FROM stdin;
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tasks (id, title, description, task_type, priority, status, due_date, survey_id, lead_id, location_id, advertiser_id, contract_id, assigned_to_user_id, assigned_to_role, created_by_user_id, completed_at, completed_by_user_id, notes, created_at, updated_at) FROM stdin;
d5dabe8a-cc7b-4727-849d-57bd271a1e92	Installatie: Test Locatie veQZ_m	Installeer 2 scherm(en) bij Test Locatie veQZ_m.\n\nLocaties: Zie schouw\nNotities: Geen	installatie	normaal	in_progress	\N	9e9f0d73-1ba7-4ca5-a2e4-8b800d213b55	da21f446-b804-4f57-aa90-55253dc07373	\N	\N	\N	\N	ops	\N	\N	\N	\N	2025-12-18 16:35:06.17997	2025-12-18 16:35:39.992
e153d0be-e98b-45b8-81db-9b7ce5b5b750	Inkoop: Test Locatie veQZ_m	Bestel materialen voor Test Locatie veQZ_m:\n\n4x HDMI kabel 3m, 2x TV 55 inch\n\nGeschatte kosten: €0	inkoop	hoog	completed	\N	9e9f0d73-1ba7-4ca5-a2e4-8b800d213b55	da21f446-b804-4f57-aa90-55253dc07373	\N	\N	\N	\N	admin	\N	\N	\N	\N	2025-12-18 16:35:06.184433	2025-12-18 17:15:40.225
\.


--
-- Data for Name: template_versions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.template_versions (id, template_id, version, subject, body, placeholders, edited_by, created_at) FROM stdin;
3abb4e2e-4299-4db8-bc38-a78f92a62eb8	e3f1844c-2b93-4101-ae10-51c956c4951c	1	Bedankt voor je interesse - Elevizion	Beste {{contactName}},\n\nBedankt voor je interesse in Elevizion! We hebben je aanvraag ontvangen en nemen zo snel mogelijk contact met je op.\n\nMet vriendelijke groet,\nTeam Elevizion	{contactName}	\N	2026-01-12 16:07:28.810131
827f34cb-ce37-4645-bf14-e3190f8c9e37	5e162dfa-0250-47d5-9200-4e5588b5e820	1	Voltooi je registratie - Elevizion	Beste {{contactName}},\n\nWelkom bij Elevizion! Klik op de onderstaande link om je registratie te voltooien:\n\n{{onboardingLink}}\n\nDeze link is 7 dagen geldig.\n\nMet vriendelijke groet,\nTeam Elevizion	{contactName,onboardingLink}	\N	2026-01-12 16:07:28.826151
f0a714df-c493-4f62-915f-004856126730	f5cc52a0-e6d8-4f62-a52e-0af91698d934	1	Herinnering: Voltooi je registratie - Elevizion	Beste {{contactName}},\n\nWe zagen dat je registratie nog niet is voltooid. Klik op de link hieronder om verder te gaan:\n\n{{onboardingLink}}\n\nHeb je vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\nTeam Elevizion	{contactName,onboardingLink}	\N	2026-01-12 16:07:28.83636
93c76c1e-be17-4da7-9ecc-78ab84295776	aa839d41-89fe-452c-884b-516753c30d0a	1	Registratie voltooid - Welkom bij Elevizion!	Beste {{contactName}},\n\nGefeliciteerd! Je registratie is voltooid. Je bent nu officieel onderdeel van het Elevizion netwerk.\n\n{{nextSteps}}\n\nMet vriendelijke groet,\nTeam Elevizion	{contactName,nextSteps}	\N	2026-01-12 16:07:28.846004
d5f1ccc1-f7e6-46ba-aa95-c99b6e79def3	25c93162-f194-4892-84db-4fd90099f3a1	1	Maandrapport {{month}} - Elevizion	Beste {{contactName}},\n\nHierbij je maandrapport voor {{month}}:\n\n{{reportContent}}\n\nMet vriendelijke groet,\nTeam Elevizion	{contactName,month,reportContent}	\N	2026-01-12 16:07:28.854743
b7dc669b-53f6-4ba6-8b43-62871e2b7482	d009c7ba-4088-43dd-b1fa-d6858a414e3e	1	Locatie Overeenkomst - Revenue Share	LOCATIE OVEREENKOMST\n\nTussen:\nElevizion B.V.\nen\n{{companyName}}\n\nBetreft: Plaatsing digitaal scherm op locatie {{locationName}}\n\nVoorwaarden:\n- Revenue share: {{revSharePct}}%\n- Startdatum: {{startDate}}\n- Looptijd: {{termMonths}} maanden\n\nGetekend te {{city}}, op {{signDate}}\n\n_________________________\n{{contactName}}	{companyName,locationName,revSharePct,startDate,termMonths,city,signDate,contactName}	\N	2026-01-12 16:07:28.863538
ea7f1307-eb21-4b40-8e65-38a7cee37042	1261e4b6-1178-4841-b387-a96978259943	1	Locatie Overeenkomst - Vaste Vergoeding	LOCATIE OVEREENKOMST\n\nTussen:\nElevizion B.V.\nen\n{{companyName}}\n\nBetreft: Plaatsing digitaal scherm op locatie {{locationName}}\n\nVoorwaarden:\n- Maandelijkse vergoeding: €{{fixedAmount}}\n- Startdatum: {{startDate}}\n- Looptijd: {{termMonths}} maanden\n\nGetekend te {{city}}, op {{signDate}}\n\n_________________________\n{{contactName}}	{companyName,locationName,fixedAmount,startDate,termMonths,city,signDate,contactName}	\N	2026-01-12 16:07:28.871641
c5f2e0e2-9aa7-4587-8b78-08ab68201ca1	5c56e348-f414-4ba9-a9ab-303450341b61	1	Advertentie Overeenkomst - Standaard	ADVERTENTIE OVEREENKOMST\n\nTussen:\nElevizion B.V.\nen\n{{companyName}}\n\nBetreft: Advertentieplaatsing op Elevizion netwerk\n\nVoorwaarden:\n- Pakket: Standaard\n- Maandbedrag: €{{monthlyAmount}}\n- Startdatum: {{startDate}}\n- Aantal schermen: {{screensCount}}\n\nGetekend te {{city}}, op {{signDate}}\n\n_________________________\n{{contactName}}	{companyName,monthlyAmount,startDate,screensCount,city,signDate,contactName}	\N	2026-01-12 16:07:28.882466
686a8de3-961c-4530-addf-9e350aa3bc53	69d041b3-d966-4d55-9a65-2123561cb385	1	Advertentie Overeenkomst - Premium	ADVERTENTIE OVEREENKOMST\n\nTussen:\nElevizion B.V.\nen\n{{companyName}}\n\nBetreft: Advertentieplaatsing op Elevizion netwerk\n\nVoorwaarden:\n- Pakket: Premium\n- Maandbedrag: €{{monthlyAmount}}\n- Startdatum: {{startDate}}\n- Aantal schermen: {{screensCount}}\n- Exclusieve plaatsing: Ja\n\nGetekend te {{city}}, op {{signDate}}\n\n_________________________\n{{contactName}}	{companyName,monthlyAmount,startDate,screensCount,city,signDate,contactName}	\N	2026-01-12 16:07:28.890248
74b78995-9914-4aa1-af9d-7c48e1ab0fef	e3f1844c-2b93-4101-ae10-51c956c4951c	2	Bedankt voor je interesse	Beste {{contactName}},\n\nBedankt voor je interesse in Elevizion!\n\nWe hebben je aanvraag ontvangen en zijn blij dat je overweegt om deel uit te maken van ons digitale netwerk.\n\nWat gebeurt er nu?\n- Binnen 24 uur neemt een van onze accountmanagers contact met je op\n- We bespreken de mogelijkheden die het beste bij jouw situatie passen\n- Je ontvangt een vrijblijvende offerte op maat\n\nHeb je in de tussentijd vragen? Neem gerust contact met ons op via info@elevizion.nl of bel naar 043-123 4567.	{contactName}	\N	2026-01-12 16:16:46.084018
3c09950f-207f-4aed-96e1-57c674392c19	5e162dfa-0250-47d5-9200-4e5588b5e820	2	Voltooi je registratie	Beste {{contactName}},\n\nWelkom bij Elevizion!\n\nFijn dat je bent begonnen met je registratie. Om je account te activeren en toegang te krijgen tot het dashboard, dien je nog enkele gegevens in te vullen.\n\nKlik op onderstaande link om je registratie te voltooien:\n{{onboardingLink}}\n\nLet op: deze link is 7 dagen geldig.\n\nWat heb je nodig?\n- Bedrijfsgegevens (KvK-nummer, BTW-nummer)\n- Contactgegevens\n- IBAN voor betalingen\n\nHet invullen duurt ongeveer 5 minuten. Na voltooiing heb je direct toegang tot je dashboard.	{contactName,onboardingLink}	\N	2026-01-12 16:16:46.10438
ec1786cb-73b3-4182-9fa1-2918354da387	f5cc52a0-e6d8-4f62-a52e-0af91698d934	2	Herinnering: Voltooi je registratie	Beste {{contactName}},\n\nWe zagen dat je registratie nog niet is voltooid.\n\nJe bent al begonnen, maar we missen nog enkele gegevens om je account te activeren. Klik op onderstaande link om verder te gaan waar je gebleven was:\n\n{{onboardingLink}}\n\nGeen zorgen - je eerder ingevulde gegevens zijn bewaard.\n\nHeb je hulp nodig of loop je ergens tegenaan? Neem gerust contact met ons op via info@elevizion.nl. We helpen je graag verder!	{contactName,onboardingLink}	\N	2026-01-12 16:16:46.121343
fbea4957-7999-45b4-95d5-135c81cde334	aa839d41-89fe-452c-884b-516753c30d0a	2	Registratie voltooid - Welkom!	Beste {{contactName}},\n\nGefeliciteerd! Je registratie is succesvol afgerond.\n\nJe bent nu officieel onderdeel van het Elevizion netwerk. Hieronder vind je de volgende stappen om aan de slag te gaan:\n\nVolgende stappen:\n1. Log in op je dashboard via app.elevizion.nl\n2. Upload je eerste advertentie of content\n3. Selecteer de schermen waarop je wilt adverteren\n4. Plan je campagne en ga live!\n\nHeb je vragen over het dashboard of de mogelijkheden? Ons supportteam staat voor je klaar via info@elevizion.nl.\n\nNogmaals welkom bij Elevizion!	{contactName}	\N	2026-01-12 16:16:46.133461
47d1f323-97d4-4b77-b61d-08bdafda5eeb	25c93162-f194-4892-84db-4fd90099f3a1	2	Maandrapport {{month}}	Beste {{contactName}},\n\nHierbij ontvang je het maandrapport voor {{month}}.\n\nIn dit rapport vind je een overzicht van:\n- Je actieve advertenties en vertoningen\n- Bereik per schermlocatie\n- Facturatie en betalingsstatus\n\nRapport Samenvatting:\n{{reportContent}}\n\nWil je meer weten over de prestaties van je campagnes of heb je vragen over dit rapport? Neem gerust contact met ons op.\n\nWe wensen je een succesvolle maand!	{contactName,month,reportContent}	\N	2026-01-12 16:16:46.143919
961e4438-9b0d-41b1-939b-e9c5a01c5c6c	d009c7ba-4088-43dd-b1fa-d6858a414e3e	2	Samenwerkingsovereenkomst - Revenue Share Model	<h2>Artikel 1 - Partijen</h2>\n<p>Deze overeenkomst wordt aangegaan tussen:</p>\n<ol>\n<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>\n<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Locatiepartner".</li>\n</ol>\n\n<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>\n<p>Elevizion plaatst één of meerdere digitale schermen op de locatie van de Locatiepartner ten behoeve van het tonen van advertenties en content van derden.</p>\n\n<h2>Artikel 3 - Locatiegegevens</h2>\n<ul>\n<li><strong>Locatienaam:</strong> {{locationName}}</li>\n<li><strong>Adres:</strong> {{address}}, {{city}}</li>\n</ul>\n\n<h2>Artikel 4 - Commerciële Voorwaarden</h2>\n<ul>\n<li><strong>Vergoedingsmodel:</strong> Revenue Share</li>\n<li><strong>Percentage:</strong> {{revSharePct}}% van de netto advertentie-inkomsten</li>\n<li><strong>Uitbetaling:</strong> Maandelijks, uiterlijk op de 15e van de volgende maand</li>\n<li><strong>Minimumgarantie:</strong> Geen</li>\n</ul>\n\n<h2>Artikel 5 - Looptijd en Opzegging</h2>\n<ul>\n<li><strong>Ingangsdatum:</strong> {{startDate}}</li>\n<li><strong>Looptijd:</strong> {{termMonths}} maanden</li>\n<li><strong>Opzegtermijn:</strong> 2 maanden voor het einde van de lopende periode</li>\n</ul>\n\n<h2>Artikel 6 - Verplichtingen Locatiepartner</h2>\n<p>De Locatiepartner zorgt voor:</p>\n<ul>\n<li>Geschikte plaatsingslocatie met stroomaansluiting</li>\n<li>Stabiele internetverbinding (WiFi of ethernet)</li>\n<li>Toegang voor onderhoud en service</li>\n</ul>\n\n<h2>Artikel 7 - Aansprakelijkheid</h2>\n<p>Elevizion is niet aansprakelijk voor indirecte schade of gevolgschade. De aansprakelijkheid van Elevizion is beperkt tot het bedrag van de vergoedingen over de laatste 3 maanden.</p>\n\n<h2>Artikel 8 - Toepasselijk Recht</h2>\n<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>	{companyName,contactName,locationName,address,city,revSharePct,startDate,termMonths}	\N	2026-01-12 16:16:46.151487
41830e67-6556-4e19-a294-0f61819b847e	1261e4b6-1178-4841-b387-a96978259943	2	Samenwerkingsovereenkomst - Vaste Vergoeding	<h2>Artikel 1 - Partijen</h2>\n<p>Deze overeenkomst wordt aangegaan tussen:</p>\n<ol>\n<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>\n<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Locatiepartner".</li>\n</ol>\n\n<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>\n<p>Elevizion plaatst één of meerdere digitale schermen op de locatie van de Locatiepartner ten behoeve van het tonen van advertenties en content van derden.</p>\n\n<h2>Artikel 3 - Locatiegegevens</h2>\n<ul>\n<li><strong>Locatienaam:</strong> {{locationName}}</li>\n<li><strong>Adres:</strong> {{address}}, {{city}}</li>\n</ul>\n\n<h2>Artikel 4 - Commerciële Voorwaarden</h2>\n<ul>\n<li><strong>Vergoedingsmodel:</strong> Vaste maandelijkse vergoeding</li>\n<li><strong>Maandbedrag:</strong> €{{fixedAmount}} (excl. BTW)</li>\n<li><strong>Uitbetaling:</strong> Maandelijks, uiterlijk op de 15e van de volgende maand</li>\n</ul>\n\n<h2>Artikel 5 - Looptijd en Opzegging</h2>\n<ul>\n<li><strong>Ingangsdatum:</strong> {{startDate}}</li>\n<li><strong>Looptijd:</strong> {{termMonths}} maanden</li>\n<li><strong>Opzegtermijn:</strong> 2 maanden voor het einde van de lopende periode</li>\n</ul>\n\n<h2>Artikel 6 - Verplichtingen Locatiepartner</h2>\n<p>De Locatiepartner zorgt voor:</p>\n<ul>\n<li>Geschikte plaatsingslocatie met stroomaansluiting</li>\n<li>Stabiele internetverbinding (WiFi of ethernet)</li>\n<li>Toegang voor onderhoud en service</li>\n</ul>\n\n<h2>Artikel 7 - Aansprakelijkheid</h2>\n<p>Elevizion is niet aansprakelijk voor indirecte schade of gevolgschade. De aansprakelijkheid van Elevizion is beperkt tot het bedrag van de vergoedingen over de laatste 3 maanden.</p>\n\n<h2>Artikel 8 - Toepasselijk Recht</h2>\n<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>	{companyName,contactName,locationName,address,city,fixedAmount,startDate,termMonths}	\N	2026-01-12 16:16:46.171141
d55c2d1b-fe0a-4d0b-8509-bac1e50f5b02	5c56e348-f414-4ba9-a9ab-303450341b61	2	Advertentieovereenkomst - Standaard Pakket	<h2>Artikel 1 - Partijen</h2>\n<p>Deze overeenkomst wordt aangegaan tussen:</p>\n<ol>\n<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>\n<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Adverteerder".</li>\n</ol>\n\n<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>\n<p>Elevizion biedt de Adverteerder de mogelijkheid om advertenties te tonen op het Elevizion digitale schermen netwerk conform de voorwaarden in deze overeenkomst.</p>\n\n<h2>Artikel 3 - Pakketgegevens</h2>\n<ul>\n<li><strong>Pakket:</strong> Standaard</li>\n<li><strong>Aantal schermen:</strong> {{screensCount}}</li>\n<li><strong>Vertoningen per dag:</strong> 480 (gemiddeld per scherm)</li>\n<li><strong>Advertentieduur:</strong> 15 seconden</li>\n</ul>\n\n<h2>Artikel 4 - Commerciële Voorwaarden</h2>\n<ul>\n<li><strong>Maandbedrag:</strong> €{{monthlyAmount}} (excl. BTW)</li>\n<li><strong>Facturatie:</strong> Maandelijks vooraf</li>\n<li><strong>Betaaltermijn:</strong> 14 dagen</li>\n</ul>\n\n<h2>Artikel 5 - Looptijd en Opzegging</h2>\n<ul>\n<li><strong>Ingangsdatum:</strong> {{startDate}}</li>\n<li><strong>Minimale looptijd:</strong> 3 maanden</li>\n<li><strong>Opzegtermijn:</strong> 1 maand</li>\n</ul>\n\n<h2>Artikel 6 - Content Richtlijnen</h2>\n<p>De Adverteerder levert content aan die voldoet aan de Elevizion content richtlijnen. Elevizion behoudt zich het recht voor om content te weigeren die niet voldoet aan deze richtlijnen.</p>\n\n<h2>Artikel 7 - Aansprakelijkheid</h2>\n<p>Elevizion is niet aansprakelijk voor technische storingen of onderbrekingen in de vertoning. Bij langdurige storingen (>24 uur) wordt een pro-rata creditering toegepast.</p>\n\n<h2>Artikel 8 - Toepasselijk Recht</h2>\n<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>	{companyName,contactName,screensCount,monthlyAmount,startDate}	\N	2026-01-12 16:16:46.199327
86da7c82-311e-43f0-a292-9ef451fe9ae8	69d041b3-d966-4d55-9a65-2123561cb385	2	Advertentieovereenkomst - Premium Pakket	<h2>Artikel 1 - Partijen</h2>\n<p>Deze overeenkomst wordt aangegaan tussen:</p>\n<ol>\n<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>\n<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Adverteerder".</li>\n</ol>\n\n<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>\n<p>Elevizion biedt de Adverteerder de mogelijkheid om advertenties te tonen op het Elevizion digitale schermen netwerk conform de voorwaarden in deze overeenkomst.</p>\n\n<h2>Artikel 3 - Premium Pakketgegevens</h2>\n<ul>\n<li><strong>Pakket:</strong> Premium (Exclusief)</li>\n<li><strong>Aantal schermen:</strong> {{screensCount}}</li>\n<li><strong>Vertoningen per dag:</strong> 720 (gemiddeld per scherm)</li>\n<li><strong>Advertentieduur:</strong> 15-30 seconden</li>\n<li><strong>Exclusiviteit:</strong> Geen concurrerende advertenties in dezelfde branche</li>\n</ul>\n\n<h2>Artikel 4 - Premium Voordelen</h2>\n<ul>\n<li>Prioriteit bij schermtoewijzing</li>\n<li>Dedicated accountmanager</li>\n<li>Maandelijkse performance rapportages</li>\n<li>Mogelijkheid tot real-time content updates</li>\n</ul>\n\n<h2>Artikel 5 - Commerciële Voorwaarden</h2>\n<ul>\n<li><strong>Maandbedrag:</strong> €{{monthlyAmount}} (excl. BTW)</li>\n<li><strong>Facturatie:</strong> Maandelijks vooraf</li>\n<li><strong>Betaaltermijn:</strong> 14 dagen</li>\n</ul>\n\n<h2>Artikel 6 - Looptijd en Opzegging</h2>\n<ul>\n<li><strong>Ingangsdatum:</strong> {{startDate}}</li>\n<li><strong>Minimale looptijd:</strong> 6 maanden</li>\n<li><strong>Opzegtermijn:</strong> 2 maanden</li>\n</ul>\n\n<h2>Artikel 7 - Aansprakelijkheid</h2>\n<p>Elevizion is niet aansprakelijk voor technische storingen of onderbrekingen in de vertoning. Bij storingen wordt prioriteit gegeven aan Premium klanten en geldt een pro-rata creditering bij storingen >12 uur.</p>\n\n<h2>Artikel 8 - Toepasselijk Recht</h2>\n<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>	{companyName,contactName,screensCount,monthlyAmount,startDate}	\N	2026-01-12 16:16:46.212013
4f700abd-813c-4516-9bbd-c1ce80ec7eb0	e3f1844c-2b93-4101-ae10-51c956c4951c	3	Bedankt voor je interesse	Beste {{contactName}},\n\nBedankt voor je interesse in Elevizion!\n\nWe hebben je aanvraag ontvangen en zijn blij dat je overweegt om deel uit te maken van ons digitale netwerk.\n\nWat gebeurt er nu?\n- Binnen 24 uur neemt een van onze accountmanagers contact met je op\n- We bespreken de mogelijkheden die het beste bij jouw situatie passen\n- Je ontvangt een vrijblijvende offerte op maat\n\nHeb je in de tussentijd vragen? Neem gerust contact met ons op via info@elevizion.nl of bel naar 043-123 4567.	{contactName}	\N	2026-01-12 16:32:49.954691
02ec6b67-3041-44ef-a060-8ddc5a16e1db	5e162dfa-0250-47d5-9200-4e5588b5e820	3	Voltooi je registratie	Beste {{contactName}},\n\nWelkom bij Elevizion!\n\nFijn dat je bent begonnen met je registratie. Om je account te activeren en toegang te krijgen tot het dashboard, dien je nog enkele gegevens in te vullen.\n\nKlik op onderstaande link om je registratie te voltooien:\n{{onboardingLink}}\n\nLet op: deze link is 7 dagen geldig.\n\nWat heb je nodig?\n- Bedrijfsgegevens (KvK-nummer, BTW-nummer)\n- Contactgegevens\n- IBAN voor betalingen\n\nHet invullen duurt ongeveer 5 minuten. Na voltooiing heb je direct toegang tot je dashboard.	{contactName,onboardingLink}	\N	2026-01-12 16:32:49.971046
da091cdd-fdb0-4f4f-bf44-499a37837359	f5cc52a0-e6d8-4f62-a52e-0af91698d934	3	Herinnering: Voltooi je registratie	Beste {{contactName}},\n\nWe zagen dat je registratie nog niet is voltooid.\n\nJe bent al begonnen, maar we missen nog enkele gegevens om je account te activeren. Klik op onderstaande link om verder te gaan waar je gebleven was:\n\n{{onboardingLink}}\n\nGeen zorgen - je eerder ingevulde gegevens zijn bewaard.\n\nHeb je hulp nodig of loop je ergens tegenaan? Neem gerust contact met ons op via info@elevizion.nl. We helpen je graag verder!	{contactName,onboardingLink}	\N	2026-01-12 16:32:49.997464
8ae933b5-9360-42b0-9419-80bb8d3b5848	aa839d41-89fe-452c-884b-516753c30d0a	3	Registratie voltooid - Welkom!	Beste {{contactName}},\n\nGefeliciteerd! Je registratie is succesvol afgerond.\n\nJe bent nu officieel onderdeel van het Elevizion netwerk. Hieronder vind je de volgende stappen om aan de slag te gaan:\n\nVolgende stappen:\n1. Log in op je dashboard via app.elevizion.nl\n2. Upload je eerste advertentie of content\n3. Selecteer de schermen waarop je wilt adverteren\n4. Plan je campagne en ga live!\n\nHeb je vragen over het dashboard of de mogelijkheden? Ons supportteam staat voor je klaar via info@elevizion.nl.\n\nNogmaals welkom bij Elevizion!	{contactName}	\N	2026-01-12 16:32:50.009731
5a01fb56-b00d-4b58-a616-d05117f0a27a	25c93162-f194-4892-84db-4fd90099f3a1	3	Maandrapport {{month}}	Beste {{contactName}},\n\nHierbij ontvang je het maandrapport voor {{month}}.\n\nIn dit rapport vind je een overzicht van:\n- Je actieve advertenties en vertoningen\n- Bereik per schermlocatie\n- Facturatie en betalingsstatus\n\nRapport Samenvatting:\n{{reportContent}}\n\nWil je meer weten over de prestaties van je campagnes of heb je vragen over dit rapport? Neem gerust contact met ons op.\n\nWe wensen je een succesvolle maand!	{contactName,month,reportContent}	\N	2026-01-12 16:32:50.023339
767a8092-f2cf-41af-a522-30c95bed1ec4	d009c7ba-4088-43dd-b1fa-d6858a414e3e	3	Samenwerkingsovereenkomst - Revenue Share Model	<h2>Artikel 1 - Partijen</h2>\n<p>Deze overeenkomst wordt aangegaan tussen:</p>\n<ol>\n<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>\n<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Locatiepartner".</li>\n</ol>\n\n<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>\n<p>Elevizion plaatst één of meerdere digitale schermen op de locatie van de Locatiepartner ten behoeve van het tonen van advertenties en content van derden.</p>\n\n<h2>Artikel 3 - Locatiegegevens</h2>\n<ul>\n<li><strong>Locatienaam:</strong> {{locationName}}</li>\n<li><strong>Adres:</strong> {{address}}, {{city}}</li>\n</ul>\n\n<h2>Artikel 4 - Commerciële Voorwaarden</h2>\n<ul>\n<li><strong>Vergoedingsmodel:</strong> Revenue Share</li>\n<li><strong>Percentage:</strong> {{revSharePct}}% van de netto advertentie-inkomsten</li>\n<li><strong>Uitbetaling:</strong> Maandelijks, uiterlijk op de 15e van de volgende maand</li>\n<li><strong>Minimumgarantie:</strong> Geen</li>\n</ul>\n\n<h2>Artikel 5 - Looptijd en Opzegging</h2>\n<ul>\n<li><strong>Ingangsdatum:</strong> {{startDate}}</li>\n<li><strong>Looptijd:</strong> {{termMonths}} maanden</li>\n<li><strong>Opzegtermijn:</strong> 2 maanden voor het einde van de lopende periode</li>\n</ul>\n\n<h2>Artikel 6 - Verplichtingen Locatiepartner</h2>\n<p>De Locatiepartner zorgt voor:</p>\n<ul>\n<li>Geschikte plaatsingslocatie met stroomaansluiting</li>\n<li>Stabiele internetverbinding (WiFi of ethernet)</li>\n<li>Toegang voor onderhoud en service</li>\n</ul>\n\n<h2>Artikel 7 - Aansprakelijkheid</h2>\n<p>Elevizion is niet aansprakelijk voor indirecte schade of gevolgschade. De aansprakelijkheid van Elevizion is beperkt tot het bedrag van de vergoedingen over de laatste 3 maanden.</p>\n\n<h2>Artikel 8 - Toepasselijk Recht</h2>\n<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>	{companyName,contactName,locationName,address,city,revSharePct,startDate,termMonths}	\N	2026-01-12 16:32:50.037861
c10e74fc-ae1d-46ba-abfd-ecb4e43c0ee7	1261e4b6-1178-4841-b387-a96978259943	3	Samenwerkingsovereenkomst - Vaste Vergoeding	<h2>Artikel 1 - Partijen</h2>\n<p>Deze overeenkomst wordt aangegaan tussen:</p>\n<ol>\n<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>\n<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Locatiepartner".</li>\n</ol>\n\n<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>\n<p>Elevizion plaatst één of meerdere digitale schermen op de locatie van de Locatiepartner ten behoeve van het tonen van advertenties en content van derden.</p>\n\n<h2>Artikel 3 - Locatiegegevens</h2>\n<ul>\n<li><strong>Locatienaam:</strong> {{locationName}}</li>\n<li><strong>Adres:</strong> {{address}}, {{city}}</li>\n</ul>\n\n<h2>Artikel 4 - Commerciële Voorwaarden</h2>\n<ul>\n<li><strong>Vergoedingsmodel:</strong> Vaste maandelijkse vergoeding</li>\n<li><strong>Maandbedrag:</strong> €{{fixedAmount}} (excl. BTW)</li>\n<li><strong>Uitbetaling:</strong> Maandelijks, uiterlijk op de 15e van de volgende maand</li>\n</ul>\n\n<h2>Artikel 5 - Looptijd en Opzegging</h2>\n<ul>\n<li><strong>Ingangsdatum:</strong> {{startDate}}</li>\n<li><strong>Looptijd:</strong> {{termMonths}} maanden</li>\n<li><strong>Opzegtermijn:</strong> 2 maanden voor het einde van de lopende periode</li>\n</ul>\n\n<h2>Artikel 6 - Verplichtingen Locatiepartner</h2>\n<p>De Locatiepartner zorgt voor:</p>\n<ul>\n<li>Geschikte plaatsingslocatie met stroomaansluiting</li>\n<li>Stabiele internetverbinding (WiFi of ethernet)</li>\n<li>Toegang voor onderhoud en service</li>\n</ul>\n\n<h2>Artikel 7 - Aansprakelijkheid</h2>\n<p>Elevizion is niet aansprakelijk voor indirecte schade of gevolgschade. De aansprakelijkheid van Elevizion is beperkt tot het bedrag van de vergoedingen over de laatste 3 maanden.</p>\n\n<h2>Artikel 8 - Toepasselijk Recht</h2>\n<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>	{companyName,contactName,locationName,address,city,fixedAmount,startDate,termMonths}	\N	2026-01-12 16:32:50.04773
fdfd299e-7c0a-41e2-8a4d-ec599717a3e5	5c56e348-f414-4ba9-a9ab-303450341b61	3	Advertentieovereenkomst - Standaard Pakket	<h2>Artikel 1 - Partijen</h2>\n<p>Deze overeenkomst wordt aangegaan tussen:</p>\n<ol>\n<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>\n<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Adverteerder".</li>\n</ol>\n\n<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>\n<p>Elevizion biedt de Adverteerder de mogelijkheid om advertenties te tonen op het Elevizion digitale schermen netwerk conform de voorwaarden in deze overeenkomst.</p>\n\n<h2>Artikel 3 - Pakketgegevens</h2>\n<ul>\n<li><strong>Pakket:</strong> Standaard</li>\n<li><strong>Aantal schermen:</strong> {{screensCount}}</li>\n<li><strong>Vertoningen per dag:</strong> 480 (gemiddeld per scherm)</li>\n<li><strong>Advertentieduur:</strong> 15 seconden</li>\n</ul>\n\n<h2>Artikel 4 - Commerciële Voorwaarden</h2>\n<ul>\n<li><strong>Maandbedrag:</strong> €{{monthlyAmount}} (excl. BTW)</li>\n<li><strong>Facturatie:</strong> Maandelijks vooraf</li>\n<li><strong>Betaaltermijn:</strong> 14 dagen</li>\n</ul>\n\n<h2>Artikel 5 - Looptijd en Opzegging</h2>\n<ul>\n<li><strong>Ingangsdatum:</strong> {{startDate}}</li>\n<li><strong>Minimale looptijd:</strong> 3 maanden</li>\n<li><strong>Opzegtermijn:</strong> 1 maand</li>\n</ul>\n\n<h2>Artikel 6 - Content Richtlijnen</h2>\n<p>De Adverteerder levert content aan die voldoet aan de Elevizion content richtlijnen. Elevizion behoudt zich het recht voor om content te weigeren die niet voldoet aan deze richtlijnen.</p>\n\n<h2>Artikel 7 - Aansprakelijkheid</h2>\n<p>Elevizion is niet aansprakelijk voor technische storingen of onderbrekingen in de vertoning. Bij langdurige storingen (>24 uur) wordt een pro-rata creditering toegepast.</p>\n\n<h2>Artikel 8 - Toepasselijk Recht</h2>\n<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>	{companyName,contactName,screensCount,monthlyAmount,startDate}	\N	2026-01-12 16:32:50.059574
ee3da158-8840-4202-923f-2a45f6540606	69d041b3-d966-4d55-9a65-2123561cb385	3	Advertentieovereenkomst - Premium Pakket	<h2>Artikel 1 - Partijen</h2>\n<p>Deze overeenkomst wordt aangegaan tussen:</p>\n<ol>\n<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>\n<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Adverteerder".</li>\n</ol>\n\n<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>\n<p>Elevizion biedt de Adverteerder de mogelijkheid om advertenties te tonen op het Elevizion digitale schermen netwerk conform de voorwaarden in deze overeenkomst.</p>\n\n<h2>Artikel 3 - Premium Pakketgegevens</h2>\n<ul>\n<li><strong>Pakket:</strong> Premium (Exclusief)</li>\n<li><strong>Aantal schermen:</strong> {{screensCount}}</li>\n<li><strong>Vertoningen per dag:</strong> 720 (gemiddeld per scherm)</li>\n<li><strong>Advertentieduur:</strong> 15-30 seconden</li>\n<li><strong>Exclusiviteit:</strong> Geen concurrerende advertenties in dezelfde branche</li>\n</ul>\n\n<h2>Artikel 4 - Premium Voordelen</h2>\n<ul>\n<li>Prioriteit bij schermtoewijzing</li>\n<li>Dedicated accountmanager</li>\n<li>Maandelijkse performance rapportages</li>\n<li>Mogelijkheid tot real-time content updates</li>\n</ul>\n\n<h2>Artikel 5 - Commerciële Voorwaarden</h2>\n<ul>\n<li><strong>Maandbedrag:</strong> €{{monthlyAmount}} (excl. BTW)</li>\n<li><strong>Facturatie:</strong> Maandelijks vooraf</li>\n<li><strong>Betaaltermijn:</strong> 14 dagen</li>\n</ul>\n\n<h2>Artikel 6 - Looptijd en Opzegging</h2>\n<ul>\n<li><strong>Ingangsdatum:</strong> {{startDate}}</li>\n<li><strong>Minimale looptijd:</strong> 6 maanden</li>\n<li><strong>Opzegtermijn:</strong> 2 maanden</li>\n</ul>\n\n<h2>Artikel 7 - Aansprakelijkheid</h2>\n<p>Elevizion is niet aansprakelijk voor technische storingen of onderbrekingen in de vertoning. Bij storingen wordt prioriteit gegeven aan Premium klanten en geldt een pro-rata creditering bij storingen >12 uur.</p>\n\n<h2>Artikel 8 - Toepasselijk Recht</h2>\n<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>	{companyName,contactName,screensCount,monthlyAmount,startDate}	\N	2026-01-12 16:32:50.069243
\.


--
-- Data for Name: templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.templates (id, name, category, subject, body, language, is_enabled, version, placeholders, e_sign_template_id, e_sign_signing_order, e_sign_required_docs, moneybird_style_id, created_by, last_edited_by, created_at, updated_at) FROM stdin;
375b9f24-0b3c-4b98-aec0-05164a5b7683	Test WhatsApp Template	whatsapp		Beste {{bedrijfsnaam}}, we willen u graag uitnodigen voor een gesprek. Met vriendelijke groet, Elevizion	nl	t	1	{bedrijfsnaam}	\N	\N	\N	\N	\N	\N	2025-12-19 11:27:28.913191	2025-12-19 11:27:28.913191
1750c6d1-ca3c-4c6b-af1e-9d57dc5e2696	what_next	email	Volgende stappen - Elevizion	Beste {{contactName}},\n\nHier zijn de volgende stappen om aan de slag te gaan met Elevizion:\n\n1. {{step1}}\n2. {{step2}}\n3. {{step3}}\n\nHeb je vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\nTeam Elevizion	nl	t	1	{contactName,step1,step2,step3}	\N	\N	\N	\N	\N	\N	2026-01-12 12:22:03.792339	2026-01-12 12:22:03.792339
25c93162-f194-4892-84db-4fd90099f3a1	monthly_report	email	Maandrapport {{month}}	Beste {{contactName}},\n\nHierbij ontvang je het maandrapport voor {{month}}.\n\nIn dit rapport vind je een overzicht van:\n- Je actieve advertenties en vertoningen\n- Bereik per schermlocatie\n- Facturatie en betalingsstatus\n\nRapport Samenvatting:\n{{reportContent}}\n\nWil je meer weten over de prestaties van je campagnes of heb je vragen over dit rapport? Neem gerust contact met ons op.\n\nWe wensen je een succesvolle maand!	nl	t	4	{contactName,month,reportContent}	\N	\N	\N	\N	\N	\N	2026-01-12 12:22:03.801697	2026-01-12 16:32:50.028
69d041b3-d966-4d55-9a65-2123561cb385	advertiser_premium	contract	Advertentieovereenkomst - Premium Pakket	<h2>Artikel 1 - Partijen</h2>\n<p>Deze overeenkomst wordt aangegaan tussen:</p>\n<ol>\n<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>\n<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Adverteerder".</li>\n</ol>\n\n<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>\n<p>Elevizion biedt de Adverteerder de mogelijkheid om advertenties te tonen op het Elevizion digitale schermen netwerk conform de voorwaarden in deze overeenkomst.</p>\n\n<h2>Artikel 3 - Premium Pakketgegevens</h2>\n<ul>\n<li><strong>Pakket:</strong> Premium (Exclusief)</li>\n<li><strong>Aantal schermen:</strong> {{screensCount}}</li>\n<li><strong>Vertoningen per dag:</strong> 720 (gemiddeld per scherm)</li>\n<li><strong>Advertentieduur:</strong> 15-30 seconden</li>\n<li><strong>Exclusiviteit:</strong> Geen concurrerende advertenties in dezelfde branche</li>\n</ul>\n\n<h2>Artikel 4 - Premium Voordelen</h2>\n<ul>\n<li>Prioriteit bij schermtoewijzing</li>\n<li>Dedicated accountmanager</li>\n<li>Maandelijkse performance rapportages</li>\n<li>Mogelijkheid tot real-time content updates</li>\n</ul>\n\n<h2>Artikel 5 - Commerciële Voorwaarden</h2>\n<ul>\n<li><strong>Maandbedrag:</strong> €{{monthlyAmount}} (excl. BTW)</li>\n<li><strong>Facturatie:</strong> Maandelijks vooraf</li>\n<li><strong>Betaaltermijn:</strong> 14 dagen</li>\n</ul>\n\n<h2>Artikel 6 - Looptijd en Opzegging</h2>\n<ul>\n<li><strong>Ingangsdatum:</strong> {{startDate}}</li>\n<li><strong>Minimale looptijd:</strong> 6 maanden</li>\n<li><strong>Opzegtermijn:</strong> 2 maanden</li>\n</ul>\n\n<h2>Artikel 7 - Aansprakelijkheid</h2>\n<p>Elevizion is niet aansprakelijk voor technische storingen of onderbrekingen in de vertoning. Bij storingen wordt prioriteit gegeven aan Premium klanten en geldt een pro-rata creditering bij storingen >12 uur.</p>\n\n<h2>Artikel 8 - Toepasselijk Recht</h2>\n<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>	nl	t	4	{companyName,contactName,screensCount,monthlyAmount,startDate}	\N	\N	\N	\N	\N	\N	2026-01-12 12:22:03.819249	2026-01-12 16:32:50.076
b0427e80-9c66-4f9c-9771-dc5371eb5332	locatie_overeenkomst	contract	Schermlocatieovereenkomst	<h1>Schermlocatieovereenkomst</h1><p><strong>Douven Services h/o Elevizion</strong><br>KvK: 90982541 | BTW: NL004857473B37</p><h2>Artikel 1 - Partijen</h2><p>Elevizion en {{companyName}}, vertegenwoordigd door {{contactName}}.</p><h2>Artikel 2 - Locatiegegevens</h2><p>Locatienaam: {{locationName}}, Adres: {{address}}, {{zipcode}} {{city}}</p><h2>Artikel 3 - Vergoeding</h2><p>Revenue Share: {{revenueSharePercent}}% van netto advertentie-inkomsten. Uitbetaling maandelijks.</p><h2>Artikel 4 - Verplichtingen</h2><p>Locatiepartner zorgt voor stroomaansluiting en internetverbinding.</p><p><em>Versie 1.0</em></p>	nl	t	1	\N	\N	\N	\N	\N	\N	\N	2026-01-13 19:17:28.985616	2026-01-13 19:17:28.985616
c7120f07-c595-45a7-9ff1-999b8295f8fc	sepa_machtiging	contract	SEPA Machtiging	<h1>SEPA Incassomachtiging</h1><p><strong>Douven Services h/o Elevizion</strong><br>KvK: 90982541 | BTW: NL004857473B37</p><h2>Crediteurgegevens</h2><p>Naam: Douven Services h/o Elevizion, Incassant ID: {{incassantId}}, IBAN: {{creditorIban}}</p><h2>Machtiging</h2><p>Door ondertekening geeft u toestemming aan Elevizion om doorlopende incasso-opdrachten te sturen.</p><h2>Debiteurgegevens</h2><p>Bedrijfsnaam: {{companyName}}, Naam rekeninghouder: {{accountHolderName}}, IBAN: {{debiteurIban}}</p><h2>Machtigingsreferentie</h2><p>{{mandateReference}}</p><h2>Voorwaarden</h2><p>U kunt binnen 8 weken na afschrijving het bedrag terugvorderen.</p><p><em>Versie 1.0</em></p>	nl	t	1	\N	\N	\N	\N	\N	\N	\N	2026-01-13 19:17:28.985616	2026-01-13 19:17:28.985616
e3f1844c-2b93-4101-ae10-51c956c4951c	lead_confirmation	email	Bedankt voor je interesse	Beste {{contactName}},\n\nBedankt voor je interesse in Elevizion!\n\nWe hebben je aanvraag ontvangen en zijn blij dat je overweegt om deel uit te maken van ons digitale netwerk.\n\nWat gebeurt er nu?\n- Binnen 24 uur neemt een van onze accountmanagers contact met je op\n- We bespreken de mogelijkheden die het beste bij jouw situatie passen\n- Je ontvangt een vrijblijvende offerte op maat\n\nHeb je in de tussentijd vragen? Neem gerust contact met ons op via info@elevizion.nl of bel naar 043-123 4567.	nl	t	4	{contactName}	\N	\N	\N	\N	\N	\N	2026-01-12 12:22:03.774079	2026-01-12 16:32:49.961
5e162dfa-0250-47d5-9200-4e5588b5e820	onboarding_link	email	Voltooi je registratie	Beste {{contactName}},\n\nWelkom bij Elevizion!\n\nFijn dat je bent begonnen met je registratie. Om je account te activeren en toegang te krijgen tot het dashboard, dien je nog enkele gegevens in te vullen.\n\nKlik op onderstaande link om je registratie te voltooien:\n{{onboardingLink}}\n\nLet op: deze link is 7 dagen geldig.\n\nWat heb je nodig?\n- Bedrijfsgegevens (KvK-nummer, BTW-nummer)\n- Contactgegevens\n- IBAN voor betalingen\n\nHet invullen duurt ongeveer 5 minuten. Na voltooiing heb je direct toegang tot je dashboard.	nl	t	4	{contactName,onboardingLink}	\N	\N	\N	\N	\N	\N	2026-01-12 12:22:03.779561	2026-01-12 16:32:49.991
f5cc52a0-e6d8-4f62-a52e-0af91698d934	onboarding_reminder	email	Herinnering: Voltooi je registratie	Beste {{contactName}},\n\nWe zagen dat je registratie nog niet is voltooid.\n\nJe bent al begonnen, maar we missen nog enkele gegevens om je account te activeren. Klik op onderstaande link om verder te gaan waar je gebleven was:\n\n{{onboardingLink}}\n\nGeen zorgen - je eerder ingevulde gegevens zijn bewaard.\n\nHeb je hulp nodig of loop je ergens tegenaan? Neem gerust contact met ons op via info@elevizion.nl. We helpen je graag verder!	nl	t	4	{contactName,onboardingLink}	\N	\N	\N	\N	\N	\N	2026-01-12 12:22:03.78509	2026-01-12 16:32:50.002
aa839d41-89fe-452c-884b-516753c30d0a	onboarding_completed	email	Registratie voltooid - Welkom!	Beste {{contactName}},\n\nGefeliciteerd! Je registratie is succesvol afgerond.\n\nJe bent nu officieel onderdeel van het Elevizion netwerk. Hieronder vind je de volgende stappen om aan de slag te gaan:\n\nVolgende stappen:\n1. Log in op je dashboard via app.elevizion.nl\n2. Upload je eerste advertentie of content\n3. Selecteer de schermen waarop je wilt adverteren\n4. Plan je campagne en ga live!\n\nHeb je vragen over het dashboard of de mogelijkheden? Ons supportteam staat voor je klaar via info@elevizion.nl.\n\nNogmaals welkom bij Elevizion!	nl	t	4	{contactName}	\N	\N	\N	\N	\N	\N	2026-01-12 12:22:03.788509	2026-01-12 16:32:50.013
5c56e348-f414-4ba9-a9ab-303450341b61	advertiser_standard	contract	Advertentieovereenkomst - Standaard Pakket	<h2>Artikel 1 - Partijen</h2>\n<p>Deze overeenkomst wordt aangegaan tussen:</p>\n<ol>\n<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>\n<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Adverteerder".</li>\n</ol>\n\n<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>\n<p>Elevizion biedt de Adverteerder de mogelijkheid om advertenties te tonen op het Elevizion digitale schermen netwerk conform de voorwaarden in deze overeenkomst.</p>\n\n<h2>Artikel 3 - Pakketgegevens</h2>\n<ul>\n<li><strong>Pakket:</strong> Standaard</li>\n<li><strong>Aantal schermen:</strong> {{screensCount}}</li>\n<li><strong>Vertoningen per dag:</strong> 480 (gemiddeld per scherm)</li>\n<li><strong>Advertentieduur:</strong> 15 seconden</li>\n</ul>\n\n<h2>Artikel 4 - Commerciële Voorwaarden</h2>\n<ul>\n<li><strong>Maandbedrag:</strong> €{{monthlyAmount}} (excl. BTW)</li>\n<li><strong>Facturatie:</strong> Maandelijks vooraf</li>\n<li><strong>Betaaltermijn:</strong> 14 dagen</li>\n</ul>\n\n<h2>Artikel 5 - Looptijd en Opzegging</h2>\n<ul>\n<li><strong>Ingangsdatum:</strong> {{startDate}}</li>\n<li><strong>Minimale looptijd:</strong> 3 maanden</li>\n<li><strong>Opzegtermijn:</strong> 1 maand</li>\n</ul>\n\n<h2>Artikel 6 - Content Richtlijnen</h2>\n<p>De Adverteerder levert content aan die voldoet aan de Elevizion content richtlijnen. Elevizion behoudt zich het recht voor om content te weigeren die niet voldoet aan deze richtlijnen.</p>\n\n<h2>Artikel 7 - Aansprakelijkheid</h2>\n<p>Elevizion is niet aansprakelijk voor technische storingen of onderbrekingen in de vertoning. Bij langdurige storingen (>24 uur) wordt een pro-rata creditering toegepast.</p>\n\n<h2>Artikel 8 - Toepasselijk Recht</h2>\n<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>	nl	t	4	{companyName,contactName,screensCount,monthlyAmount,startDate}	\N	\N	\N	\N	\N	\N	2026-01-12 12:22:03.814669	2026-01-12 16:32:50.063
d009c7ba-4088-43dd-b1fa-d6858a414e3e	location_revshare	contract	Samenwerkingsovereenkomst - Revenue Share Model	<h2>Artikel 1 - Partijen</h2>\n<p>Deze overeenkomst wordt aangegaan tussen:</p>\n<ol>\n<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>\n<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Locatiepartner".</li>\n</ol>\n\n<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>\n<p>Elevizion plaatst één of meerdere digitale schermen op de locatie van de Locatiepartner ten behoeve van het tonen van advertenties en content van derden.</p>\n\n<h2>Artikel 3 - Locatiegegevens</h2>\n<ul>\n<li><strong>Locatienaam:</strong> {{locationName}}</li>\n<li><strong>Adres:</strong> {{address}}, {{city}}</li>\n</ul>\n\n<h2>Artikel 4 - Commerciële Voorwaarden</h2>\n<ul>\n<li><strong>Vergoedingsmodel:</strong> Revenue Share</li>\n<li><strong>Percentage:</strong> {{revSharePct}}% van de netto advertentie-inkomsten</li>\n<li><strong>Uitbetaling:</strong> Maandelijks, uiterlijk op de 15e van de volgende maand</li>\n<li><strong>Minimumgarantie:</strong> Geen</li>\n</ul>\n\n<h2>Artikel 5 - Looptijd en Opzegging</h2>\n<ul>\n<li><strong>Ingangsdatum:</strong> {{startDate}}</li>\n<li><strong>Looptijd:</strong> {{termMonths}} maanden</li>\n<li><strong>Opzegtermijn:</strong> 2 maanden voor het einde van de lopende periode</li>\n</ul>\n\n<h2>Artikel 6 - Verplichtingen Locatiepartner</h2>\n<p>De Locatiepartner zorgt voor:</p>\n<ul>\n<li>Geschikte plaatsingslocatie met stroomaansluiting</li>\n<li>Stabiele internetverbinding (WiFi of ethernet)</li>\n<li>Toegang voor onderhoud en service</li>\n</ul>\n\n<h2>Artikel 7 - Aansprakelijkheid</h2>\n<p>Elevizion is niet aansprakelijk voor indirecte schade of gevolgschade. De aansprakelijkheid van Elevizion is beperkt tot het bedrag van de vergoedingen over de laatste 3 maanden.</p>\n\n<h2>Artikel 8 - Toepasselijk Recht</h2>\n<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>	nl	t	4	{companyName,contactName,locationName,address,city,revSharePct,startDate,termMonths}	\N	\N	\N	\N	\N	\N	2026-01-12 12:22:03.805638	2026-01-12 16:32:50.041
1261e4b6-1178-4841-b387-a96978259943	location_fixed	contract	Samenwerkingsovereenkomst - Vaste Vergoeding	<h2>Artikel 1 - Partijen</h2>\n<p>Deze overeenkomst wordt aangegaan tussen:</p>\n<ol>\n<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>\n<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Locatiepartner".</li>\n</ol>\n\n<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>\n<p>Elevizion plaatst één of meerdere digitale schermen op de locatie van de Locatiepartner ten behoeve van het tonen van advertenties en content van derden.</p>\n\n<h2>Artikel 3 - Locatiegegevens</h2>\n<ul>\n<li><strong>Locatienaam:</strong> {{locationName}}</li>\n<li><strong>Adres:</strong> {{address}}, {{city}}</li>\n</ul>\n\n<h2>Artikel 4 - Commerciële Voorwaarden</h2>\n<ul>\n<li><strong>Vergoedingsmodel:</strong> Vaste maandelijkse vergoeding</li>\n<li><strong>Maandbedrag:</strong> €{{fixedAmount}} (excl. BTW)</li>\n<li><strong>Uitbetaling:</strong> Maandelijks, uiterlijk op de 15e van de volgende maand</li>\n</ul>\n\n<h2>Artikel 5 - Looptijd en Opzegging</h2>\n<ul>\n<li><strong>Ingangsdatum:</strong> {{startDate}}</li>\n<li><strong>Looptijd:</strong> {{termMonths}} maanden</li>\n<li><strong>Opzegtermijn:</strong> 2 maanden voor het einde van de lopende periode</li>\n</ul>\n\n<h2>Artikel 6 - Verplichtingen Locatiepartner</h2>\n<p>De Locatiepartner zorgt voor:</p>\n<ul>\n<li>Geschikte plaatsingslocatie met stroomaansluiting</li>\n<li>Stabiele internetverbinding (WiFi of ethernet)</li>\n<li>Toegang voor onderhoud en service</li>\n</ul>\n\n<h2>Artikel 7 - Aansprakelijkheid</h2>\n<p>Elevizion is niet aansprakelijk voor indirecte schade of gevolgschade. De aansprakelijkheid van Elevizion is beperkt tot het bedrag van de vergoedingen over de laatste 3 maanden.</p>\n\n<h2>Artikel 8 - Toepasselijk Recht</h2>\n<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>	nl	t	4	{companyName,contactName,locationName,address,city,fixedAmount,startDate,termMonths}	\N	\N	\N	\N	\N	\N	2026-01-12 12:22:03.810551	2026-01-12 16:32:50.052
2d2345b6-4102-4995-a0cb-bd99fdd8170c	algemene_voorwaarden	contract	Algemene Voorwaarden Elevizion	<h1>Algemene Voorwaarden</h1><p><strong>Douven Services h/o Elevizion</strong><br>KvK: 90982541 | BTW: NL004857473B37</p><h2>Artikel 1 - Definities</h2><p>In deze algemene voorwaarden wordt verstaan onder: Elevizion, Klant, Diensten, Overeenkomst.</p><h2>Artikel 2 - Toepasselijkheid</h2><p>Deze algemene voorwaarden zijn van toepassing op alle aanbiedingen en overeenkomsten.</p><h2>Artikel 3 - Prijzen en Betaling</h2><p>Alle prijzen zijn exclusief BTW. Betaling binnen 14 dagen.</p><h2>Artikel 4 - Toepasselijk Recht</h2><p>Op alle overeenkomsten is Nederlands recht van toepassing.</p><p><em>Versie 1.0</em></p>	nl	t	1	\N	\N	\N	\N	\N	\N	\N	2026-01-13 19:17:28.985616	2026-01-13 19:17:28.985616
e5fb65f4-51dd-4910-b030-7d013d83d3d6	adverteerder_overeenkomst	contract	Adverteerderovereenkomst	<h1>Adverteerderovereenkomst</h1><p><strong>Douven Services h/o Elevizion</strong><br>KvK: 90982541 | BTW: NL004857473B37</p><h2>Artikel 1 - Partijen</h2><p>Elevizion en {{companyName}}, vertegenwoordigd door {{contactName}}.</p><h2>Artikel 2 - Pakketgegevens</h2><p>Pakket: {{packageName}}, Aantal schermen: {{screenCount}}, Prijs per scherm: €{{pricePerScreen}} per maand.</p><h2>Artikel 3 - Content</h2><p>Adverteerder levert zelf video content (MP4, 1920x1080, 10-15 seconden, 16:9, geen audio). Elevizion maakt geen advertenties.</p><h2>Artikel 4 - Looptijd</h2><p>Minimale looptijd: {{minimumTermMonths}} maanden.</p><p><em>Versie 1.0</em></p>	nl	t	1	\N	\N	\N	\N	\N	\N	\N	2026-01-13 19:17:28.985616	2026-01-13 19:17:28.985616
\.


--
-- Data for Name: terms_acceptance; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.terms_acceptance (id, entity_type, entity_id, accepted_at, ip, user_agent, terms_version, terms_hash, source, created_at) FROM stdin;
\.


--
-- Data for Name: upload_jobs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.upload_jobs (id, advertiser_id, ad_asset_id, local_asset_path, local_file_size, local_duration_seconds, yodeck_media_id, yodeck_media_name, status, attempt, max_attempts, last_error, last_error_at, yodeck_file_size, yodeck_duration, yodeck_status, next_retry_at, created_at, updated_at, completed_at, correlation_id, desired_filename, create_response, upload_url, put_status, put_etag, confirm_response, poll_attempts, final_state, error_code, error_details, finalize_attempted, finalize_status, finalize_url_used) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, first_name, last_name, profile_image_url, role, location_id, is_active, last_login_at, created_at, updated_at, username, display_name, password_hash, role_preset, permissions, force_password_change) FROM stdin;
51472361	fdouven8@gmail.com	Frank	Douven	\N	eigenaar	\N	t	2026-02-12 23:22:03.652	2025-12-17 17:48:16.361885	2026-02-24 00:26:46.454	admin	Administrator	$2b$12$mTHFNS7AAEEsELKmzfUktui2X01sMFpV.fjCCoBV70RkrOMQmye6q	eigenaar	{view_home,view_screens,edit_screens,view_advertisers,edit_advertisers,view_placements,edit_placements,view_finance,view_onboarding,onboard_advertisers,onboard_screens,manage_templates,manage_integrations,manage_users,edit_system_settings}	f
3399c0ad-339a-466b-9368-c6e0525cc0b5	test@elevizion.nl	\N	\N	\N	admin	\N	t	2026-01-12 13:36:32.961	2026-01-12 13:32:56.167151	2026-01-12 13:36:32.961	testuser	\N	$2b$10$zWbpa5OtG59Sc0dCAu1EWuzi33ecQFeZ6yPJ0Wf.1eW7gMkN.2olG	\N	\N	f
\.


--
-- Data for Name: verification_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.verification_codes (id, email, code_hash, expires_at, attempts, used_at, created_at, contract_document_id) FROM stdin;
73d1c9c4-7ebd-43f4-9752-ad65529f69a9	test@elevizion.nl	d8a2f9fd62eda3720421ce7e60a8ff7cb15e20c66b7f024e1a31bad8265032c1	2026-01-05 17:41:46.556	1	\N	2026-01-05 17:31:46.557609	\N
\.


--
-- Data for Name: waitlist_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.waitlist_requests (id, company_name, contact_name, email, phone, kvk_number, vat_number, package_type, business_category, competitor_group, target_region_codes, required_count, status, last_checked_at, invite_token_hash, invite_sent_at, invite_expires_at, claimed_at, cancelled_at, advertiser_id, notes, created_at, updated_at) FROM stdin;
6a92c0b8-ce9d-46e4-97c9-d3330a1abf84	Test Company	Test User	test@example.com	\N	\N	\N	STARTER	restaurant	restaurant	\N	1	INVITED	2026-02-24 00:09:34.022	39f56e0b973183dd6b620bad8e1853db5db127512e4754e73f69143249b3e1cf	2026-02-24 00:09:34.034	2026-02-26 00:09:34.034	\N	\N	\N	\N	2026-01-14 02:23:57.338334	2026-02-24 00:09:34.034
89ce886f-5c55-4dc3-bf6f-f10a067e5676	Test Company 2	Test User 2	test2@example.com	\N	\N	\N	TRIPLE	restaurant	restaurant	{NH,ZH}	3	WAITING	2026-02-24 00:29:07.409	\N	\N	\N	\N	\N	\N	\N	2026-01-14 02:30:49.167692	2026-02-24 00:29:07.409
\.


--
-- Data for Name: webhook_deliveries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.webhook_deliveries (id, webhook_id, event_type, payload, response_status, response_body, delivered_at, status, error_message, created_at) FROM stdin;
\.


--
-- Data for Name: webhooks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.webhooks (id, name, url, event_types, secret, is_enabled, last_triggered_at, failure_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: yodeck_creatives; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.yodeck_creatives (id, yodeck_media_id, name, media_type, duration, category, advertiser_id, last_seen_at, created_at, updated_at, match_type, match_confidence, suggested_advertiser_id) FROM stdin;
c64477f4-872b-435e-a02c-259de6df5bd5	29975064	Elevizion promo 1	media	24	ad	\N	2026-02-24 00:22:45.111	2026-02-11 11:22:02.161642	2026-02-24 00:22:45.111	\N	\N	\N
6954e41f-9cd1-4ec2-93dd-3b9b987221ce	27476141	NOS sport algemeen	media	30	non_ad	\N	2026-02-24 00:22:45.126	2025-12-24 18:25:09.131969	2026-02-24 00:22:45.126	\N	\N	\N
4c967597-72dc-4a06-b754-4974f7f44fb4	29378800	ADV-BOUWSERVICEDOUVEN-756846_Header Frontpage(2).mp4	media	5	ad	\N	2026-01-29 16:15:39.498	2026-01-29 14:27:55.589707	2026-01-29 16:15:39.498	\N	\N	\N
0c358129-ce1d-4118-a824-a983275e92ab	29408113	ADV-BOUWSERVICEDOUVEN-756846_Header Frontpage(2).mp4	media	5	ad	\N	2026-01-29 16:15:39.515	2026-01-28 01:27:49.412852	2026-01-29 16:15:39.515	\N	\N	\N
e1dd7f26-4615-4a95-b0f4-236095441de4	27477130	Weer goed	media	15	non_ad	\N	2026-02-24 00:22:45.143	2025-12-24 18:25:09.142327	2026-02-24 00:22:45.143	\N	\N	\N
a1654525-c55a-4ad2-bd65-46d8313cd5e7	27476083	NOS algemeen nieuws	media	30	non_ad	\N	2026-02-24 00:22:45.158	2025-12-24 18:25:09.152437	2026-02-24 00:22:45.158	\N	\N	\N
5ea565f3-a84d-495a-bd23-873cca45dc99	29881336	ADV-BOUWSERVICEDOUVEN-ADV-BOUW-202602051247.mp4	media	15	ad	\N	2026-02-24 00:22:45.287	2026-02-10 15:22:03.435464	2026-02-24 00:22:45.287	\N	\N	\N
e85e501c-4b12-4bc0-85af-d9fda5925ace	30148692	ADV-HOI-75BF95_Testvideo 2.mp4	media	15	ad	\N	2026-02-24 00:22:45.304	2026-02-17 17:08:43.984577	2026-02-24 00:22:45.304	\N	\N	\N
3830835a-3719-46da-8d03-05db5227b4c0	29860650	EVZ-AD-3941d02f.mp4	media	15	ad	\N	2026-02-07 15:45:58.918	2026-02-06 16:46:15.561763	2026-02-07 15:45:58.918	\N	\N	\N
6b8b792b-0ebd-4898-8006-d39b3ae73da1	26703349	See your business grow	media	-1	ad	\N	2026-01-27 00:33:04.278	2025-12-24 18:25:09.137027	2026-01-27 00:33:04.278	\N	\N	\N
da649bc7-bbb3-4d94-b2bc-0632794f0b8b	26476034	Sample Sales Sign	media	5	ad	\N	2026-01-27 00:33:04.315	2025-12-24 18:25:09.147777	2026-01-27 00:33:04.315	\N	\N	\N
0d2e224c-e387-45f7-9cdf-b840ef0a6d71	29881729	ADV-BOUWSERVICEDOUVEN-ADV-BOUW-202602051247.mp4	media	15	ad	\N	2026-02-08 13:24:47.381	2026-02-08 12:58:24.950361	2026-02-08 13:24:47.381	\N	\N	\N
0e59c77e-bebe-4f8d-a11f-b26a0fac6a94	26476033	Sample Coupons Video	media	-1	ad	\N	2026-01-27 00:33:04.338	2025-12-24 18:25:09.157471	2026-01-27 00:33:04.338	\N	\N	\N
5d6f35ca-124f-4e98-a440-8cc415f659d9	27478716	1Limburg	media	10	non_ad	\N	2026-02-11 23:35:13.566	2026-01-28 15:14:26.586495	2026-02-11 23:35:13.566	\N	\N	\N
4ef2152f-1fc6-4930-a434-048f60db7ca4	29893553	EVZ-PURE-29893461.mp4	media	15	ad	\N	2026-02-11 23:35:13.578	2026-02-08 15:23:25.3984	2026-02-11 23:35:13.578	\N	\N	\N
73ffc289-17dd-445b-ab06-11fcc8db1c3a	29889127	EVZ-AD-3941d02f.mp4	media	15	ad	\N	2026-02-08 03:12:13.85	2026-02-08 03:12:13.852129	2026-02-08 03:12:13.852129	\N	\N	\N
bf514f4b-aa35-44dc-ac46-ab621cbd2bf2	29892561	EVZ-PURE-29892530.mp4	media	15	ad	\N	2026-02-08 14:37:28.883	2026-02-08 13:34:59.356191	2026-02-08 14:37:28.883	\N	\N	\N
a6cde140-4d22-4423-b5a2-8309a894d92f	29661498	ADV-BOUWSERVICEDOUVEN-756846.mp4	media	15	ad	\N	2026-01-31 09:42:05.367	2026-01-31 09:12:05.45402	2026-01-31 09:42:05.367	\N	\N	\N
db1174a8-17b9-4d3e-b320-4453a3dab491	29893421	EVZ-PURE-29892561.mp4	media	15	ad	\N	2026-02-08 15:00:33.298	2026-02-08 15:00:33.30136	2026-02-08 15:00:33.30136	\N	\N	\N
f0d4eaee-67e0-488f-a1cc-89bd5be75439	27478775	NOS opmerkelijk	media	20	non_ad	\N	2026-02-09 17:13:28.625	2026-01-30 22:07:42.071858	2026-02-09 17:13:28.625	\N	\N	\N
\.


--
-- Data for Name: yodeck_media_links; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.yodeck_media_links (id, yodeck_media_id, name, normalized_key, media_type, category, duration, advertiser_id, placement_id, last_seen_at, screen_count, created_at, updated_at, status, archived_at, match_type, match_confidence) FROM stdin;
89316646-fb50-4983-af56-b73928a0e130	30148692	ADV-HOI-75BF95_Testvideo 2.mp4	adv_hoi_75bf95_testvideo_2_mp4	media	ad	15	\N	\N	2026-02-24 00:22:45.313	1	2026-02-17 17:08:44.096653	2026-02-24 00:22:45.313	UNLINKED	\N	\N	\N
9bf94301-68dc-47d4-9b70-0131633d610f	29860650	EVZ-AD-3941d02f.mp4	evz_ad_3941d02f_mp4	media	ad	15	\N	\N	2026-02-07 15:45:58.925	1	2026-02-06 16:46:15.575168	2026-02-07 15:45:58.925	UNLINKED	\N	\N	\N
730dda2f-a4d3-44cf-982a-efe6debba824	29892561	EVZ-PURE-29892530.mp4	evz_pure_29892530_mp4	media	ad	15	\N	\N	2026-02-08 14:37:28.888	1	2026-02-08 13:34:59.360421	2026-02-08 14:37:28.888	UNLINKED	\N	\N	\N
5b8c703e-4388-469d-98ad-10d06db37853	27478775	NOS opmerkelijk	nos_opmerkelijk	media	non_ad	20	\N	\N	2026-02-09 17:13:28.633	1	2026-01-30 22:07:42.077996	2026-02-09 17:13:28.633	UNLINKED	\N	\N	\N
4515ba52-8eaa-468b-93a9-72a2ba145134	29881729	ADV-BOUWSERVICEDOUVEN-ADV-BOUW-202602051247.mp4	adv_bouwservicedouven_adv_bouw_202602051247_mp4	media	ad	15	\N	\N	2026-02-08 13:24:47.386	1	2026-02-08 12:58:24.954591	2026-02-08 13:24:47.386	UNLINKED	\N	\N	\N
72de7380-b9ff-465e-b345-b1ebc510cc07	29893421	EVZ-PURE-29892561.mp4	evz_pure_29892561_mp4	media	ad	15	\N	\N	2026-02-08 15:00:33.305	1	2026-02-08 15:00:33.306281	2026-02-08 15:00:33.306281	UNLINKED	\N	\N	\N
0e4446f0-e9cc-46b0-87e3-fa0c92600170	26703349	See your business grow	see_your_business_grow	media	ad	-1	\N	\N	2026-01-27 00:33:04.284	1	2025-12-24 20:08:50.92771	2026-01-27 00:33:04.284	UNLINKED	\N	\N	\N
fd2419b6-9827-4531-bfc8-8878bb51db0f	29378800	ADV-BOUWSERVICEDOUVEN-756846_Header Frontpage(2).mp4	adv_bouwservicedouven_756846_header_frontpage_2_mp4	media	ad	5	\N	\N	2026-01-29 16:15:39.503	1	2026-01-29 14:27:55.595943	2026-01-29 16:15:39.503	UNLINKED	\N	\N	\N
f88cec9f-aeb5-48b8-b0c2-db165ee39142	26476034	Sample Sales Sign	sample_sales_sign	media	ad	5	\N	\N	2026-01-27 00:33:04.319	1	2025-12-24 20:08:50.943361	2026-01-27 00:33:04.319	UNLINKED	\N	\N	\N
4f79e255-6214-4277-9486-6f5479410a6a	29408113	ADV-BOUWSERVICEDOUVEN-756846_Header Frontpage(2).mp4	adv_bouwservicedouven_756846_header_frontpage_2_mp4	media	ad	5	\N	\N	2026-01-29 16:15:39.52	1	2026-01-28 01:27:49.427089	2026-01-29 16:15:39.52	UNLINKED	\N	\N	\N
58570e74-dcbc-4881-8b5f-2c98239e9869	26476033	Sample Coupons Video	sample_coupons_video	media	ad	-1	\N	\N	2026-01-27 00:33:04.342	1	2025-12-24 20:08:50.958074	2026-01-27 00:33:04.342	UNLINKED	\N	\N	\N
7e8222c3-0428-4c6e-a6c6-3c96b0387642	27478716	1Limburg	1limburg	media	non_ad	10	\N	\N	2026-02-11 23:35:13.57	1	2026-01-28 15:14:26.694826	2026-02-11 23:35:13.57	UNLINKED	\N	\N	\N
5d52bd46-2498-40d1-8981-c7385d5099af	29893553	EVZ-PURE-29893461.mp4	evz_pure_29893461_mp4	media	ad	15	\N	\N	2026-02-11 23:35:13.582	1	2026-02-08 15:23:25.404253	2026-02-11 23:35:13.582	UNLINKED	\N	\N	\N
6439bb1b-4d2a-448d-ac5b-2e71dbdb6765	29975064	Elevizion promo 1	elevizion_promo_1	media	ad	24	\N	\N	2026-02-24 00:22:45.119	1	2026-02-11 11:22:02.205193	2026-02-24 00:22:45.119	UNLINKED	\N	\N	\N
572faaa0-8678-4559-9d1c-4d3262a0b225	29661498	ADV-BOUWSERVICEDOUVEN-756846.mp4	adv_bouwservicedouven_756846_mp4	media	ad	15	\N	\N	2026-01-31 09:42:05.371	1	2026-01-31 09:12:05.46251	2026-01-31 09:42:05.371	UNLINKED	\N	\N	\N
e8fadd32-0437-4ecf-8083-eb92dce59a5c	27476141	NOS sport algemeen	nos_sport_algemeen	media	non_ad	30	\N	\N	2026-02-24 00:22:45.131	1	2025-12-24 20:08:50.915427	2026-02-24 00:22:45.131	UNLINKED	\N	\N	\N
fce8980d-6a2b-475d-aad8-ddf76fc347fc	29889127	EVZ-AD-3941d02f.mp4	evz_ad_3941d02f_mp4	media	ad	15	\N	\N	2026-02-08 03:12:13.859	1	2026-02-08 03:12:13.860186	2026-02-08 03:12:13.860186	UNLINKED	\N	\N	\N
52ded235-a523-435c-8e59-3be1ff7a231d	27477130	Weer goed	weer_goed	media	non_ad	15	\N	\N	2026-02-24 00:22:45.148	1	2025-12-24 20:08:50.934678	2026-02-24 00:22:45.148	UNLINKED	\N	\N	\N
16096959-781e-4e83-b8df-a3f50c266bb7	27476083	NOS algemeen nieuws	nos_algemeen_nieuws	media	non_ad	30	\N	\N	2026-02-24 00:22:45.165	1	2025-12-24 20:08:50.950981	2026-02-24 00:22:45.165	UNLINKED	\N	\N	\N
229bafb8-975c-4dba-8613-a267d87f14cd	29881336	ADV-BOUWSERVICEDOUVEN-ADV-BOUW-202602051247.mp4	adv_bouwservicedouven_adv_bouw_202602051247_mp4	media	ad	15	\N	\N	2026-02-24 00:22:45.292	1	2026-02-10 15:22:03.446714	2026-02-24 00:22:45.292	UNLINKED	\N	\N	\N
\.


--
-- Data for Name: yodeck_screens_cache; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.yodeck_screens_cache (yodeck_screen_id, name, uuid, status, last_seen, screenshot_url, raw, updated_at) FROM stdin;
\.


--
-- Name: ad_assets ad_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_assets
    ADD CONSTRAINT ad_assets_pkey PRIMARY KEY (id);


--
-- Name: advertiser_accounts advertiser_accounts_advertiser_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertiser_accounts
    ADD CONSTRAINT advertiser_accounts_advertiser_id_key UNIQUE (advertiser_id);


--
-- Name: advertiser_accounts advertiser_accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertiser_accounts
    ADD CONSTRAINT advertiser_accounts_email_key UNIQUE (email);


--
-- Name: advertiser_accounts advertiser_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertiser_accounts
    ADD CONSTRAINT advertiser_accounts_pkey PRIMARY KEY (id);


--
-- Name: advertiser_leads advertiser_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertiser_leads
    ADD CONSTRAINT advertiser_leads_pkey PRIMARY KEY (id);


--
-- Name: advertisers advertisers_link_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertisers
    ADD CONSTRAINT advertisers_link_key_key UNIQUE (link_key);


--
-- Name: advertisers advertisers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertisers
    ADD CONSTRAINT advertisers_pkey PRIMARY KEY (id);


--
-- Name: alert_rules alert_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_rules
    ADD CONSTRAINT alert_rules_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: carry_overs carry_overs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carry_overs
    ADD CONSTRAINT carry_overs_pkey PRIMARY KEY (id);


--
-- Name: claim_prefills claim_prefills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_prefills
    ADD CONSTRAINT claim_prefills_pkey PRIMARY KEY (id);


--
-- Name: company_profile company_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profile
    ADD CONSTRAINT company_profile_pkey PRIMARY KEY (id);


--
-- Name: contact_roles contact_roles_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_roles
    ADD CONSTRAINT contact_roles_pk PRIMARY KEY (moneybird_contact_id, role);


--
-- Name: contract_documents contract_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_documents
    ADD CONSTRAINT contract_documents_pkey PRIMARY KEY (id);


--
-- Name: contract_events contract_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_events
    ADD CONSTRAINT contract_events_pkey PRIMARY KEY (id);


--
-- Name: contract_files contract_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_files
    ADD CONSTRAINT contract_files_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: creative_approvals creative_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creative_approvals
    ADD CONSTRAINT creative_approvals_pkey PRIMARY KEY (id);


--
-- Name: creative_versions creative_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creative_versions
    ADD CONSTRAINT creative_versions_pkey PRIMARY KEY (id);


--
-- Name: creatives creatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creatives
    ADD CONSTRAINT creatives_pkey PRIMARY KEY (id);


--
-- Name: digital_signatures digital_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_signatures
    ADD CONSTRAINT digital_signatures_pkey PRIMARY KEY (id);


--
-- Name: e2e_test_runs e2e_test_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.e2e_test_runs
    ADD CONSTRAINT e2e_test_runs_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: entities entities_entity_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_entity_code_key UNIQUE (entity_code);


--
-- Name: entities entities_moneybird_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_moneybird_contact_id_key UNIQUE (moneybird_contact_id);


--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (id);


--
-- Name: entities entities_yodeck_device_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_yodeck_device_id_key UNIQUE (yodeck_device_id);


--
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);


--
-- Name: integration_configs integration_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_configs
    ADD CONSTRAINT integration_configs_pkey PRIMARY KEY (id);


--
-- Name: integration_configs integration_configs_service_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_configs
    ADD CONSTRAINT integration_configs_service_key UNIQUE (service);


--
-- Name: integration_logs integration_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_logs
    ADD CONSTRAINT integration_logs_pkey PRIMARY KEY (id);


--
-- Name: integration_outbox integration_outbox_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_outbox
    ADD CONSTRAINT integration_outbox_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: integration_outbox integration_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_outbox
    ADD CONSTRAINT integration_outbox_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: job_runs job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_runs
    ADD CONSTRAINT job_runs_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_name_unique UNIQUE (name);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: location_groups location_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_groups
    ADD CONSTRAINT location_groups_pkey PRIMARY KEY (id);


--
-- Name: location_onboarding_events location_onboarding_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_onboarding_events
    ADD CONSTRAINT location_onboarding_events_pkey PRIMARY KEY (id);


--
-- Name: location_payouts location_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_payouts
    ADD CONSTRAINT location_payouts_pkey PRIMARY KEY (id);


--
-- Name: location_surveys location_surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_surveys
    ADD CONSTRAINT location_surveys_pkey PRIMARY KEY (id);


--
-- Name: location_tokens location_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_tokens
    ADD CONSTRAINT location_tokens_pkey PRIMARY KEY (id);


--
-- Name: locations locations_contract_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_contract_token_key UNIQUE (contract_token);


--
-- Name: locations locations_intake_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_intake_token_key UNIQUE (intake_token);


--
-- Name: locations locations_location_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_location_code_key UNIQUE (location_code);


--
-- Name: locations locations_location_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_location_key_key UNIQUE (location_key);


--
-- Name: locations locations_moneybird_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_moneybird_contact_id_key UNIQUE (moneybird_contact_id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: moneybird_contacts_cache moneybird_contacts_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moneybird_contacts_cache
    ADD CONSTRAINT moneybird_contacts_cache_pkey PRIMARY KEY (moneybird_contact_id);


--
-- Name: moneybird_contacts moneybird_contacts_moneybird_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moneybird_contacts
    ADD CONSTRAINT moneybird_contacts_moneybird_id_key UNIQUE (moneybird_id);


--
-- Name: moneybird_contacts moneybird_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moneybird_contacts
    ADD CONSTRAINT moneybird_contacts_pkey PRIMARY KEY (id);


--
-- Name: moneybird_invoices moneybird_invoices_moneybird_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moneybird_invoices
    ADD CONSTRAINT moneybird_invoices_moneybird_id_key UNIQUE (moneybird_id);


--
-- Name: moneybird_invoices moneybird_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moneybird_invoices
    ADD CONSTRAINT moneybird_invoices_pkey PRIMARY KEY (id);


--
-- Name: moneybird_payments moneybird_payments_moneybird_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moneybird_payments
    ADD CONSTRAINT moneybird_payments_moneybird_id_key UNIQUE (moneybird_id);


--
-- Name: moneybird_payments moneybird_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moneybird_payments
    ADD CONSTRAINT moneybird_payments_pkey PRIMARY KEY (id);


--
-- Name: monthly_reports monthly_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_reports
    ADD CONSTRAINT monthly_reports_pkey PRIMARY KEY (id);


--
-- Name: onboarding_checklists onboarding_checklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_checklists
    ADD CONSTRAINT onboarding_checklists_pkey PRIMARY KEY (id);


--
-- Name: onboarding_invite_tokens onboarding_invite_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_invite_tokens
    ADD CONSTRAINT onboarding_invite_tokens_pkey PRIMARY KEY (id);


--
-- Name: onboarding_tasks onboarding_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_tasks
    ADD CONSTRAINT onboarding_tasks_pkey PRIMARY KEY (id);


--
-- Name: package_plans package_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_plans
    ADD CONSTRAINT package_plans_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: placement_plans placement_plans_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placement_plans
    ADD CONSTRAINT placement_plans_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: placement_plans placement_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placement_plans
    ADD CONSTRAINT placement_plans_pkey PRIMARY KEY (id);


--
-- Name: placement_targets placement_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placement_targets
    ADD CONSTRAINT placement_targets_pkey PRIMARY KEY (id);


--
-- Name: placements placements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placements
    ADD CONSTRAINT placements_pkey PRIMARY KEY (id);


--
-- Name: plans plans_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_code_key UNIQUE (code);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: portal_placements portal_placements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_placements
    ADD CONSTRAINT portal_placements_pkey PRIMARY KEY (id);


--
-- Name: portal_tokens portal_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_tokens
    ADD CONSTRAINT portal_tokens_pkey PRIMARY KEY (id);


--
-- Name: portal_user_screen_selections portal_user_screen_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_user_screen_selections
    ADD CONSTRAINT portal_user_screen_selections_pkey PRIMARY KEY (id);


--
-- Name: portal_users portal_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_users
    ADD CONSTRAINT portal_users_email_key UNIQUE (email);


--
-- Name: portal_users portal_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_users
    ADD CONSTRAINT portal_users_pkey PRIMARY KEY (id);


--
-- Name: report_logs report_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_logs
    ADD CONSTRAINT report_logs_pkey PRIMARY KEY (id);


--
-- Name: report_metrics report_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_metrics
    ADD CONSTRAINT report_metrics_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: revenue_allocations revenue_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenue_allocations
    ADD CONSTRAINT revenue_allocations_pkey PRIMARY KEY (id);


--
-- Name: sales_activities sales_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_activities
    ADD CONSTRAINT sales_activities_pkey PRIMARY KEY (id);


--
-- Name: schedule_snapshots schedule_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_snapshots
    ADD CONSTRAINT schedule_snapshots_pkey PRIMARY KEY (id);


--
-- Name: screen_content_items screen_content_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screen_content_items
    ADD CONSTRAINT screen_content_items_pkey PRIMARY KEY (id);


--
-- Name: screen_groups screen_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screen_groups
    ADD CONSTRAINT screen_groups_pkey PRIMARY KEY (id);


--
-- Name: screen_leads screen_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screen_leads
    ADD CONSTRAINT screen_leads_pkey PRIMARY KEY (id);


--
-- Name: screens screens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_pkey PRIMARY KEY (id);


--
-- Name: screens screens_screen_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_screen_id_unique UNIQUE (screen_id);


--
-- Name: screens screens_yodeck_uuid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_yodeck_uuid_key UNIQUE (yodeck_uuid);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);


--
-- Name: site_contact_snapshot site_contact_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_contact_snapshot
    ADD CONSTRAINT site_contact_snapshot_pkey PRIMARY KEY (id);


--
-- Name: site_yodeck_snapshot site_yodeck_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_yodeck_snapshot
    ADD CONSTRAINT site_yodeck_snapshot_pkey PRIMARY KEY (id);


--
-- Name: sites sites_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_code_key UNIQUE (code);


--
-- Name: sites sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);


--
-- Name: sites sites_yodeck_screen_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_yodeck_screen_id_key UNIQUE (yodeck_screen_id);


--
-- Name: snapshot_placements snapshot_placements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snapshot_placements
    ADD CONSTRAINT snapshot_placements_pkey PRIMARY KEY (id);


--
-- Name: supply_items supply_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_items
    ADD CONSTRAINT supply_items_pkey PRIMARY KEY (id);


--
-- Name: survey_photos survey_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_photos
    ADD CONSTRAINT survey_photos_pkey PRIMARY KEY (id);


--
-- Name: survey_supplies survey_supplies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_supplies
    ADD CONSTRAINT survey_supplies_pkey PRIMARY KEY (id);


--
-- Name: sync_jobs sync_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_jobs
    ADD CONSTRAINT sync_jobs_pkey PRIMARY KEY (id);


--
-- Name: sync_logs sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_logs
    ADD CONSTRAINT sync_logs_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_key_key UNIQUE (key);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: tag_policies tag_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_policies
    ADD CONSTRAINT tag_policies_pkey PRIMARY KEY (id);


--
-- Name: tag_policies tag_policies_tag_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_policies
    ADD CONSTRAINT tag_policies_tag_name_key UNIQUE (tag_name);


--
-- Name: task_attachments task_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: template_versions template_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_versions
    ADD CONSTRAINT template_versions_pkey PRIMARY KEY (id);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: terms_acceptance terms_acceptance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terms_acceptance
    ADD CONSTRAINT terms_acceptance_pkey PRIMARY KEY (id);


--
-- Name: upload_jobs upload_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_jobs
    ADD CONSTRAINT upload_jobs_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: verification_codes verification_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_codes
    ADD CONSTRAINT verification_codes_pkey PRIMARY KEY (id);


--
-- Name: waitlist_requests waitlist_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_requests
    ADD CONSTRAINT waitlist_requests_pkey PRIMARY KEY (id);


--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: yodeck_creatives yodeck_creatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.yodeck_creatives
    ADD CONSTRAINT yodeck_creatives_pkey PRIMARY KEY (id);


--
-- Name: yodeck_creatives yodeck_creatives_yodeck_media_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.yodeck_creatives
    ADD CONSTRAINT yodeck_creatives_yodeck_media_id_key UNIQUE (yodeck_media_id);


--
-- Name: yodeck_media_links yodeck_media_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.yodeck_media_links
    ADD CONSTRAINT yodeck_media_links_pkey PRIMARY KEY (id);


--
-- Name: yodeck_media_links yodeck_media_links_yodeck_media_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.yodeck_media_links
    ADD CONSTRAINT yodeck_media_links_yodeck_media_id_key UNIQUE (yodeck_media_id);


--
-- Name: yodeck_screens_cache yodeck_screens_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.yodeck_screens_cache
    ADD CONSTRAINT yodeck_screens_cache_pkey PRIMARY KEY (yodeck_screen_id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.sessions USING btree (expire);


--
-- Name: idx_portal_tokens_advertiser; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portal_tokens_advertiser ON public.portal_tokens USING btree (advertiser_id);


--
-- Name: idx_yodeck_creatives_advertiser; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_yodeck_creatives_advertiser ON public.yodeck_creatives USING btree (advertiser_id);


--
-- Name: idx_yodeck_creatives_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_yodeck_creatives_category ON public.yodeck_creatives USING btree (category);


--
-- Name: portal_placements_advertiser_screen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX portal_placements_advertiser_screen_idx ON public.portal_placements USING btree (advertiser_id, screen_id);


--
-- Name: portal_user_screen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX portal_user_screen_idx ON public.portal_user_screen_selections USING btree (portal_user_id, screen_id);


--
-- Name: report_logs_advertiser_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX report_logs_advertiser_period_idx ON public.report_logs USING btree (advertiser_id, period_key);


--
-- Name: screen_content_items_screen_media_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX screen_content_items_screen_media_idx ON public.screen_content_items USING btree (screen_id, yodeck_media_id);


--
-- Name: ad_assets ad_assets_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_assets
    ADD CONSTRAINT ad_assets_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: advertiser_accounts advertiser_accounts_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertiser_accounts
    ADD CONSTRAINT advertiser_accounts_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: advertisers advertisers_plan_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertisers
    ADD CONSTRAINT advertisers_plan_id_fk FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: carry_overs carry_overs_from_payout_id_payouts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carry_overs
    ADD CONSTRAINT carry_overs_from_payout_id_payouts_id_fk FOREIGN KEY (from_payout_id) REFERENCES public.payouts(id);


--
-- Name: carry_overs carry_overs_location_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carry_overs
    ADD CONSTRAINT carry_overs_location_id_locations_id_fk FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: carry_overs carry_overs_to_payout_id_payouts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carry_overs
    ADD CONSTRAINT carry_overs_to_payout_id_payouts_id_fk FOREIGN KEY (to_payout_id) REFERENCES public.payouts(id);


--
-- Name: claim_prefills claim_prefills_waitlist_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_prefills
    ADD CONSTRAINT claim_prefills_waitlist_request_id_fkey FOREIGN KEY (waitlist_request_id) REFERENCES public.waitlist_requests(id) ON DELETE CASCADE;


--
-- Name: contract_events contract_events_contract_id_contracts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_events
    ADD CONSTRAINT contract_events_contract_id_contracts_id_fk FOREIGN KEY (contract_id) REFERENCES public.contracts(id);


--
-- Name: contract_files contract_files_contract_id_contracts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_files
    ADD CONSTRAINT contract_files_contract_id_contracts_id_fk FOREIGN KEY (contract_id) REFERENCES public.contracts(id);


--
-- Name: contracts contracts_advertiser_id_advertisers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_advertiser_id_advertisers_id_fk FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: contracts contracts_package_plan_id_package_plans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_package_plan_id_package_plans_id_fk FOREIGN KEY (package_plan_id) REFERENCES public.package_plans(id);


--
-- Name: creative_approvals creative_approvals_creative_id_creatives_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creative_approvals
    ADD CONSTRAINT creative_approvals_creative_id_creatives_id_fk FOREIGN KEY (creative_id) REFERENCES public.creatives(id);


--
-- Name: creative_versions creative_versions_creative_id_creatives_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creative_versions
    ADD CONSTRAINT creative_versions_creative_id_creatives_id_fk FOREIGN KEY (creative_id) REFERENCES public.creatives(id);


--
-- Name: creatives creatives_advertiser_id_advertisers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creatives
    ADD CONSTRAINT creatives_advertiser_id_advertisers_id_fk FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: incidents incidents_location_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_location_id_locations_id_fk FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: incidents incidents_screen_id_screens_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_screen_id_screens_id_fk FOREIGN KEY (screen_id) REFERENCES public.screens(id);


--
-- Name: invoices invoices_advertiser_id_advertisers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_advertiser_id_advertisers_id_fk FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: invoices invoices_contract_id_contracts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_contract_id_contracts_id_fk FOREIGN KEY (contract_id) REFERENCES public.contracts(id);


--
-- Name: invoices invoices_snapshot_id_schedule_snapshots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_snapshot_id_schedule_snapshots_id_fk FOREIGN KEY (snapshot_id) REFERENCES public.schedule_snapshots(id);


--
-- Name: job_runs job_runs_job_id_jobs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_runs
    ADD CONSTRAINT job_runs_job_id_jobs_id_fk FOREIGN KEY (job_id) REFERENCES public.jobs(id);


--
-- Name: location_onboarding_events location_onboarding_events_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_onboarding_events
    ADD CONSTRAINT location_onboarding_events_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: location_payouts location_payouts_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_payouts
    ADD CONSTRAINT location_payouts_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: location_surveys location_surveys_lead_id_leads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_surveys
    ADD CONSTRAINT location_surveys_lead_id_leads_id_fk FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: location_surveys location_surveys_location_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_surveys
    ADD CONSTRAINT location_surveys_location_id_locations_id_fk FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: location_tokens location_tokens_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_tokens
    ADD CONSTRAINT location_tokens_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: moneybird_contacts moneybird_contacts_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moneybird_contacts
    ADD CONSTRAINT moneybird_contacts_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: moneybird_invoices moneybird_invoices_internal_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moneybird_invoices
    ADD CONSTRAINT moneybird_invoices_internal_invoice_id_fkey FOREIGN KEY (internal_invoice_id) REFERENCES public.invoices(id);


--
-- Name: onboarding_checklists onboarding_checklists_advertiser_id_advertisers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_checklists
    ADD CONSTRAINT onboarding_checklists_advertiser_id_advertisers_id_fk FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: onboarding_tasks onboarding_tasks_checklist_id_onboarding_checklists_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_tasks
    ADD CONSTRAINT onboarding_tasks_checklist_id_onboarding_checklists_id_fk FOREIGN KEY (checklist_id) REFERENCES public.onboarding_checklists(id);


--
-- Name: payments payments_invoice_id_invoices_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_invoice_id_invoices_id_fk FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);


--
-- Name: payouts payouts_location_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_location_id_locations_id_fk FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: payouts payouts_snapshot_id_schedule_snapshots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_snapshot_id_schedule_snapshots_id_fk FOREIGN KEY (snapshot_id) REFERENCES public.schedule_snapshots(id);


--
-- Name: placement_plans placement_plans_ad_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placement_plans
    ADD CONSTRAINT placement_plans_ad_asset_id_fkey FOREIGN KEY (ad_asset_id) REFERENCES public.ad_assets(id) ON DELETE CASCADE;


--
-- Name: placement_plans placement_plans_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placement_plans
    ADD CONSTRAINT placement_plans_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: placement_targets placement_targets_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placement_targets
    ADD CONSTRAINT placement_targets_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: placement_targets placement_targets_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placement_targets
    ADD CONSTRAINT placement_targets_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.placement_plans(id) ON DELETE CASCADE;


--
-- Name: placements placements_contract_id_contracts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placements
    ADD CONSTRAINT placements_contract_id_contracts_id_fk FOREIGN KEY (contract_id) REFERENCES public.contracts(id);


--
-- Name: placements placements_screen_id_screens_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placements
    ADD CONSTRAINT placements_screen_id_screens_id_fk FOREIGN KEY (screen_id) REFERENCES public.screens(id);


--
-- Name: portal_placements portal_placements_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_placements
    ADD CONSTRAINT portal_placements_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: portal_placements portal_placements_screen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_placements
    ADD CONSTRAINT portal_placements_screen_id_fkey FOREIGN KEY (screen_id) REFERENCES public.screens(id) ON DELETE CASCADE;


--
-- Name: portal_tokens portal_tokens_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_tokens
    ADD CONSTRAINT portal_tokens_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: portal_user_screen_selections portal_user_screen_selections_portal_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_user_screen_selections
    ADD CONSTRAINT portal_user_screen_selections_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;


--
-- Name: portal_user_screen_selections portal_user_screen_selections_screen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_user_screen_selections
    ADD CONSTRAINT portal_user_screen_selections_screen_id_fkey FOREIGN KEY (screen_id) REFERENCES public.screens(id) ON DELETE CASCADE;


--
-- Name: portal_users portal_users_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_users
    ADD CONSTRAINT portal_users_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: report_logs report_logs_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_logs
    ADD CONSTRAINT report_logs_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: report_metrics report_metrics_location_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_metrics
    ADD CONSTRAINT report_metrics_location_id_locations_id_fk FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: report_metrics report_metrics_report_id_reports_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_metrics
    ADD CONSTRAINT report_metrics_report_id_reports_id_fk FOREIGN KEY (report_id) REFERENCES public.reports(id);


--
-- Name: report_metrics report_metrics_screen_id_screens_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_metrics
    ADD CONSTRAINT report_metrics_screen_id_screens_id_fk FOREIGN KEY (screen_id) REFERENCES public.screens(id);


--
-- Name: reports reports_advertiser_id_advertisers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_advertiser_id_advertisers_id_fk FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: revenue_allocations revenue_allocations_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenue_allocations
    ADD CONSTRAINT revenue_allocations_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: revenue_allocations revenue_allocations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenue_allocations
    ADD CONSTRAINT revenue_allocations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: revenue_allocations revenue_allocations_screen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenue_allocations
    ADD CONSTRAINT revenue_allocations_screen_id_fkey FOREIGN KEY (screen_id) REFERENCES public.screens(id);


--
-- Name: sales_activities sales_activities_lead_id_leads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_activities
    ADD CONSTRAINT sales_activities_lead_id_leads_id_fk FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: screen_content_items screen_content_items_linked_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screen_content_items
    ADD CONSTRAINT screen_content_items_linked_advertiser_id_fkey FOREIGN KEY (linked_advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: screen_content_items screen_content_items_linked_placement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screen_content_items
    ADD CONSTRAINT screen_content_items_linked_placement_id_fkey FOREIGN KEY (linked_placement_id) REFERENCES public.placements(id);


--
-- Name: screen_content_items screen_content_items_screen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screen_content_items
    ADD CONSTRAINT screen_content_items_screen_id_fkey FOREIGN KEY (screen_id) REFERENCES public.screens(id) ON DELETE CASCADE;


--
-- Name: screens screens_group_id_screen_groups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_group_id_screen_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.screen_groups(id);


--
-- Name: screens screens_location_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_location_group_id_fkey FOREIGN KEY (location_group_id) REFERENCES public.location_groups(id);


--
-- Name: screens screens_location_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_location_id_locations_id_fk FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: site_contact_snapshot site_contact_snapshot_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_contact_snapshot
    ADD CONSTRAINT site_contact_snapshot_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: site_yodeck_snapshot site_yodeck_snapshot_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_yodeck_snapshot
    ADD CONSTRAINT site_yodeck_snapshot_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: snapshot_placements snapshot_placements_advertiser_id_advertisers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snapshot_placements
    ADD CONSTRAINT snapshot_placements_advertiser_id_advertisers_id_fk FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: snapshot_placements snapshot_placements_contract_id_contracts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snapshot_placements
    ADD CONSTRAINT snapshot_placements_contract_id_contracts_id_fk FOREIGN KEY (contract_id) REFERENCES public.contracts(id);


--
-- Name: snapshot_placements snapshot_placements_location_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snapshot_placements
    ADD CONSTRAINT snapshot_placements_location_id_locations_id_fk FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: snapshot_placements snapshot_placements_placement_id_placements_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snapshot_placements
    ADD CONSTRAINT snapshot_placements_placement_id_placements_id_fk FOREIGN KEY (placement_id) REFERENCES public.placements(id);


--
-- Name: snapshot_placements snapshot_placements_screen_id_screens_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snapshot_placements
    ADD CONSTRAINT snapshot_placements_screen_id_screens_id_fk FOREIGN KEY (screen_id) REFERENCES public.screens(id);


--
-- Name: snapshot_placements snapshot_placements_snapshot_id_schedule_snapshots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snapshot_placements
    ADD CONSTRAINT snapshot_placements_snapshot_id_schedule_snapshots_id_fk FOREIGN KEY (snapshot_id) REFERENCES public.schedule_snapshots(id);


--
-- Name: survey_photos survey_photos_survey_id_location_surveys_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_photos
    ADD CONSTRAINT survey_photos_survey_id_location_surveys_id_fk FOREIGN KEY (survey_id) REFERENCES public.location_surveys(id);


--
-- Name: survey_supplies survey_supplies_supply_item_id_supply_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_supplies
    ADD CONSTRAINT survey_supplies_supply_item_id_supply_items_id_fk FOREIGN KEY (supply_item_id) REFERENCES public.supply_items(id);


--
-- Name: survey_supplies survey_supplies_survey_id_location_surveys_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_supplies
    ADD CONSTRAINT survey_supplies_survey_id_location_surveys_id_fk FOREIGN KEY (survey_id) REFERENCES public.location_surveys(id);


--
-- Name: sync_jobs sync_jobs_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_jobs
    ADD CONSTRAINT sync_jobs_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: task_attachments task_attachments_task_id_tasks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_task_id_tasks_id_fk FOREIGN KEY (task_id) REFERENCES public.tasks(id);


--
-- Name: tasks tasks_advertiser_id_advertisers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_advertiser_id_advertisers_id_fk FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: tasks tasks_contract_id_contracts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_contract_id_contracts_id_fk FOREIGN KEY (contract_id) REFERENCES public.contracts(id);


--
-- Name: tasks tasks_lead_id_leads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_lead_id_leads_id_fk FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: tasks tasks_location_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_location_id_locations_id_fk FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: tasks tasks_survey_id_location_surveys_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_survey_id_location_surveys_id_fk FOREIGN KEY (survey_id) REFERENCES public.location_surveys(id);


--
-- Name: template_versions template_versions_edited_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_versions
    ADD CONSTRAINT template_versions_edited_by_users_id_fk FOREIGN KEY (edited_by) REFERENCES public.users(id);


--
-- Name: template_versions template_versions_template_id_templates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_versions
    ADD CONSTRAINT template_versions_template_id_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.templates(id);


--
-- Name: templates templates_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: templates templates_last_edited_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_last_edited_by_users_id_fk FOREIGN KEY (last_edited_by) REFERENCES public.users(id);


--
-- Name: upload_jobs upload_jobs_ad_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_jobs
    ADD CONSTRAINT upload_jobs_ad_asset_id_fkey FOREIGN KEY (ad_asset_id) REFERENCES public.ad_assets(id) ON DELETE SET NULL;


--
-- Name: upload_jobs upload_jobs_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_jobs
    ADD CONSTRAINT upload_jobs_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: webhook_deliveries webhook_deliveries_webhook_id_webhooks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_webhook_id_webhooks_id_fk FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id);


--
-- Name: yodeck_creatives yodeck_creatives_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.yodeck_creatives
    ADD CONSTRAINT yodeck_creatives_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: yodeck_creatives yodeck_creatives_suggested_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.yodeck_creatives
    ADD CONSTRAINT yodeck_creatives_suggested_advertiser_id_fkey FOREIGN KEY (suggested_advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: yodeck_media_links yodeck_media_links_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.yodeck_media_links
    ADD CONSTRAINT yodeck_media_links_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id);


--
-- Name: yodeck_media_links yodeck_media_links_placement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.yodeck_media_links
    ADD CONSTRAINT yodeck_media_links_placement_id_fkey FOREIGN KEY (placement_id) REFERENCES public.placements(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 8M9xfekjtl3XMmpEs0DpmWWE6cBY0wq7fzg68bESetBhhfkIneVYBvl9js9xHi7

