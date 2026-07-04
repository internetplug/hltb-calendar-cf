-- Optional display name shown in the UI. Email remains the login identifier.
ALTER TABLE users ADD COLUMN username TEXT;
