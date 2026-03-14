-- Migration: 002_create_progress
-- Creates the progress table with GENERATED mastery_score and mastery_level columns

CREATE TABLE IF NOT EXISTS progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic VARCHAR(255) NOT NULL,
    exercise_completion NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (exercise_completion >= 0 AND exercise_completion <= 1),
    quiz_score NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (quiz_score >= 0 AND quiz_score <= 1),
    code_quality NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (code_quality >= 0 AND code_quality <= 1),
    consistency_streak NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (consistency_streak >= 0 AND consistency_streak <= 1),
    mastery_score NUMERIC(5, 4) GENERATED ALWAYS AS (
        (exercise_completion * 0.40) + (quiz_score * 0.30) + (code_quality * 0.20) + (consistency_streak * 0.10)
    ) STORED,
    mastery_level VARCHAR(20) GENERATED ALWAYS AS (
        CASE
            WHEN ((exercise_completion * 0.40) + (quiz_score * 0.30) + (code_quality * 0.20) + (consistency_streak * 0.10)) >= 0.85 THEN 'Mastered'
            WHEN ((exercise_completion * 0.40) + (quiz_score * 0.30) + (code_quality * 0.20) + (consistency_streak * 0.10)) >= 0.65 THEN 'Proficient'
            WHEN ((exercise_completion * 0.40) + (quiz_score * 0.30) + (code_quality * 0.20) + (consistency_streak * 0.10)) >= 0.40 THEN 'Learning'
            ELSE 'Beginner'
        END
    ) STORED,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_progress_student_id ON progress (student_id);
CREATE INDEX IF NOT EXISTS idx_progress_topic ON progress (topic);
CREATE INDEX IF NOT EXISTS idx_progress_mastery_level ON progress (mastery_level);

COMMENT ON TABLE progress IS 'Per-student per-topic mastery tracking with computed scores';
COMMENT ON COLUMN progress.mastery_score IS 'Weighted: exercise×0.40 + quiz×0.30 + code_quality×0.20 + consistency×0.10';
COMMENT ON COLUMN progress.mastery_level IS 'Beginner (<0.40), Learning (0.40–0.65), Proficient (0.65–0.85), Mastered (≥0.85)';
