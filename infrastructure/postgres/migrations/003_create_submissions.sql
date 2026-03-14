-- Migration: 003_create_submissions
-- Creates the submissions table for code review and exercise grade records

CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id TEXT,
    code TEXT NOT NULL,
    execution_result TEXT,
    review_feedback JSONB,
    grade VARCHAR(20) CHECK (grade IN ('pass', 'fail', 'partial')),
    topic VARCHAR(255),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON submissions (student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_exercise_id ON submissions (exercise_id);
CREATE INDEX IF NOT EXISTS idx_submissions_topic ON submissions (topic);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions (submitted_at DESC);

COMMENT ON TABLE submissions IS 'Student code submission records with review feedback and grades';
COMMENT ON COLUMN submissions.review_feedback IS 'JSONB: {verdict, pep8_violations, correctness_issues, suggestions}';
COMMENT ON COLUMN submissions.grade IS 'pass/fail/partial — set after sandbox execution + AI review';
