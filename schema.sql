-- HumanPulse D1 Schema

-- Agent queries
CREATE TABLE IF NOT EXISTS pulses (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  question TEXT NOT NULL,
  context TEXT,
  payload TEXT,
  category TEXT NOT NULL CHECK(category IN ('social', 'ethical', 'emotional', 'cultural')),
  min_responses INTEGER NOT NULL DEFAULT 3 CHECK(min_responses BETWEEN 3 AND 7),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'complete', 'insufficient_responses')),
  consensus TEXT CHECK(consensus IN ('yes', 'no', 'depends')),
  confidence REAL,
  summary TEXT,
  recommendation TEXT,
  responses_used INTEGER DEFAULT 0,
  outliers_removed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Human answers
CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  pulse_id TEXT NOT NULL,
  respondent_token TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('yes', 'no', 'depends')),
  certainty INTEGER NOT NULL CHECK(certainty BETWEEN 1 AND 5),
  time_to_respond_ms INTEGER,
  is_suspicious INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (pulse_id) REFERENCES pulses(id)
);

-- Anonymous respondents
CREATE TABLE IF NOT EXISTS respondents (
  token TEXT PRIMARY KEY,
  email_hash TEXT,
  reputation_score REAL NOT NULL DEFAULT 1.0,
  total_responses INTEGER NOT NULL DEFAULT 0,
  calibration_accuracy REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Silent calibration questions
CREATE TABLE IF NOT EXISTS calibration_questions (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  context TEXT,
  correct_direction TEXT NOT NULL CHECK(correct_direction IN ('yes', 'no', 'depends')),
  category TEXT NOT NULL CHECK(category IN ('social', 'ethical', 'emotional', 'cultural')),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_pulses_status ON pulses(status);
CREATE INDEX IF NOT EXISTS idx_pulses_agent ON pulses(agent_id);
CREATE INDEX IF NOT EXISTS idx_responses_pulse ON responses(pulse_id);
CREATE INDEX IF NOT EXISTS idx_responses_respondent ON responses(respondent_token);
