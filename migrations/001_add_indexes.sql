CREATE INDEX IF NOT EXISTS idx_calls_created_at_desc ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_segments_call_id ON segments(call_id);
CREATE INDEX IF NOT EXISTS idx_qa_results_call_id ON qa_results(call_id);
CREATE INDEX IF NOT EXISTS idx_pii_call_id ON pii_mappings(call_id);
