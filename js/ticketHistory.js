// js/ticketHistory.js
(function(){
	const sb = window.sb;
	if (!sb) return;

	// Resolve a ticket atomically using a Postgres function (see SQL below)
	async function resolveTicketAtomic({
		ticketId,
		statusTo = 'resolved',
		resolutionReason = null,
		tags = null,
		metadata = null
	}){
		try {
			// Get current user for resolved_by field
			const { data: sessionData } = await sb.auth.getUser();
			const resolvedBy = sessionData?.user?.id || null;

			const { data, error } = await sb.rpc('resolve_ticket_and_log', {
				p_ticket_id: ticketId,
				p_status_to: statusTo,
				p_resolution_reason: resolutionReason,
				p_tags: tags,
				p_metadata: metadata,
				p_resolved_by: resolvedBy
			});
			if (error) throw error;
			return data;
		} catch (e) {
			console.error('resolveTicketAtomic failed:', e);
			throw e;
		}
	}

	// Expose globally for reuse from tickets UI
	window.resolveTicketAtomic = resolveTicketAtomic;
})();

/*
-- SQL to create the RPC and ensure atomic insert into ticket_history
-- Run this in your DB once.

create or replace function public.resolve_ticket_and_log(
	p_ticket_id bigint,
	p_status_to text,
	p_resolution_reason text default null,
	p_tags jsonb default null,
	p_metadata jsonb default null,
	p_resolved_by uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
	v_old record;
	v_new record;
	v_now timestamptz := now();
	v_duration interval;
	v_result jsonb;
begin
	-- Lock and fetch the ticket row
	select * into v_old from ticket where id = p_ticket_id for update;
	if not found then
		raise exception 'Ticket % not found', p_ticket_id using errcode = 'NO_DATA_FOUND';
	end if;

	if v_old.status = p_status_to then
		-- No change; return snapshot
		v_result := jsonb_build_object('snapshot', to_jsonb(v_old));
		return v_result;
	end if;

	-- Update ticket status
	update ticket
		 set status = p_status_to
	 where id = p_ticket_id
	 returning * into v_new;

	v_duration := v_now - v_old.created_at;

	-- Insert history row with JSONB snapshot of UPDATED ticket (v_new)
	insert into ticket_history(
		ticket_id,
		list_id,
		name,
		person,
		amount,
		status_from,
		status_to,
		resolved_at,
		resolved_by,
		resolution_reason,
		duration,
		tags,
		snapshot,
		metadata,
		created_at
	)
	values (
		v_new.id,
		v_new.list_id,
		v_new.name,
		v_new.person,
		v_new.amount_due,
		v_old.status,
		v_new.status,
		v_now,
		p_resolved_by,
		p_resolution_reason,
		v_duration,
		coalesce(p_tags, '{}'::jsonb),
		to_jsonb(v_new),
		coalesce(p_metadata, '{}'::jsonb),
		v_now
	);

	v_result := jsonb_build_object(
		'ticket', to_jsonb(v_new),
		'history_logged', true
	);
	return v_result;
end;
$$;

-- Optional: grant execute to anon/authenticated as needed
-- grant execute on function public.resolve_ticket_and_log(bigint, text, text, jsonb, jsonb, uuid) to anon, authenticated;
*/
