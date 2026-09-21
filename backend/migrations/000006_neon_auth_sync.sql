-- 000006_neon_auth_sync.sql
-- Synchronizes Neon Auth identities with application domain users and multi-tenant memberships.

CREATE OR REPLACE FUNCTION public.handle_neon_user_sync()
RETURNS TRIGGER AS $$
DECLARE
    default_org_id UUID := '11111111-1111-1111-1111-111111111111';
BEGIN
    -- Upsert into public.users
    INSERT INTO public.users (id, email, full_name, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.name, split_part(NEW.email, '@', 1)),
        COALESCE(NEW."createdAt", CURRENT_TIMESTAMP),
        COALESCE(NEW."updatedAt", CURRENT_TIMESTAMP)
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = EXCLUDED.updated_at;

    -- Ensure default tenant membership exists
    IF EXISTS (SELECT 1 FROM public.organizations WHERE id = default_org_id) THEN
        INSERT INTO public.organization_memberships (
            organization_id,
            user_id,
            role,
            created_at,
            updated_at
        ) VALUES (
            default_org_id,
            NEW.id,
            CASE WHEN NEW.email = 'geologist@geoquerry.com' THEN 'owner' ELSE 'geologist' END,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (organization_id, user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_neon_auth_user_sync ON neon_auth."user";

CREATE TRIGGER on_neon_auth_user_sync
AFTER INSERT OR UPDATE ON neon_auth."user"
FOR EACH ROW
EXECUTE FUNCTION public.handle_neon_user_sync();
