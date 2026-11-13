-- Database Migration: Add Language Columns to Flashcards Table
-- Run this in your Supabase SQL Editor

-- Add language columns to flashcards table
ALTER TABLE flashcards 
ADD COLUMN IF NOT EXISTS original_language TEXT DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS translation_language TEXT;

-- Add index for better query performance on language columns
CREATE INDEX IF NOT EXISTS idx_flashcards_languages 
ON flashcards(original_language, translation_language);

-- Optional: Update existing rows to have default language values
UPDATE flashcards 
SET original_language = 'auto', 
    translation_language = 'en'
WHERE original_language IS NULL 
   OR translation_language IS NULL;

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'flashcards'
ORDER BY ordinal_position;




