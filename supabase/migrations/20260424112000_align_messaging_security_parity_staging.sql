-- Staging-first draft.
-- Align the messaging security/authorization behavior with production.
-- This draft intentionally does NOT copy the production unread_total(...) fallback.

CREATE OR REPLACE FUNCTION public.handle_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  update public.conversations c
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 140),
      customer_unread_count = case
        when new.recipient_id = c.customer_id then c.customer_unread_count + 1
        else c.customer_unread_count
      end,
      business_unread_count = case
        when new.recipient_id = c.business_id then c.business_unread_count + 1
        else c.business_unread_count
      end
  where c.id = new.conversation_id;

  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.handle_message_insert() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_customer_id uuid,
  p_business_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  convo_id uuid;
  customer_role text;
  business_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if auth.uid() <> p_customer_id then
    raise exception 'Only the customer can start a conversation';
  end if;

  if p_customer_id = p_business_id then
    raise exception 'Customer and business must be different users';
  end if;

  select u.role into customer_role
  from public.users u
  where u.id = p_customer_id;

  select u.role into business_role
  from public.users u
  where u.id = p_business_id;

  if customer_role is null or business_role is null then
    raise exception 'Invalid participants';
  end if;

  if customer_role <> 'customer' or business_role <> 'business' then
    raise exception 'Conversation must be between customer and business';
  end if;

  insert into public.conversations (customer_id, business_id)
  values (p_customer_id, p_business_id)
  on conflict (customer_id, business_id) do nothing
  returning id into convo_id;

  if convo_id is null then
    select c.id into convo_id
    from public.conversations c
    where c.customer_id = p_customer_id
      and c.business_id = p_business_id;
  end if;

  return convo_id;
end;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  convo_customer uuid;
  convo_business uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select c.customer_id, c.business_id
  into convo_customer, convo_business
  from public.conversations c
  where c.id = conversation_id;

  if not found then
    raise exception 'Conversation not found';
  end if;

  if auth.uid() <> convo_customer and auth.uid() <> convo_business then
    raise exception 'Not a conversation participant';
  end if;

  update public.messages m
  set read_at = now()
  where m.conversation_id = mark_conversation_read.conversation_id
    and m.recipient_id = auth.uid()
    and m.read_at is null;

  if auth.uid() = convo_customer then
    update public.conversations c
    set customer_unread_count = 0
    where c.id = mark_conversation_read.conversation_id;
  else
    update public.conversations c
    set business_unread_count = 0
    where c.id = mark_conversation_read.conversation_id;
  end if;
end;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
