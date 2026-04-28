# Setup Instructions for Language Columns Feature

## ✅ Completed Steps

1. **Installed Dependencies**: `@supabase/supabase-js` has been added to the chrome-extension package
2. **Updated Background Script**: Added support for language columns and flashcards handlers
3. **Added Type Interfaces**: Created `FlashcardsMessage` interface for type safety

## 🔧 Required Manual Steps

### 1. Database Migration (REQUIRED)

You need to add the language columns to your Supabase `flashcards` table. Run this SQL in your **Supabase SQL Editor**:

```sql
-- Add language columns to flashcards table
ALTER TABLE flashcards 
ADD COLUMN IF NOT EXISTS original_language TEXT DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS translation_language TEXT;

-- Optional: Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_flashcards_languages 
ON flashcards(original_language, translation_language);
```

### 2. Environment Variables

Ensure you have a `.env` file in the project root with these variables:

```env
CEB_API_KEY=your_deepl_api_key_here
CEB_SUPABASE_KEY=your_supabase_anon_key_here
```

**How to get these keys:**

- **DeepL API Key**: 
  - Sign up at https://www.deepl.com/pro-api
  - Free tier: 500,000 characters/month
  - Get your API key from the account dashboard

- **Supabase Key**:
  - Go to your Supabase project dashboard
  - Navigate to Settings → API
  - Copy the `anon` public key

### 3. Verify Installation

After setting up the environment variables, rebuild the extension:

```bash
pnpm dev
```

Then check the browser console for:
- ✅ "API_KEY: set"
- ✅ "SUPABASE_KEY: set"
- ✅ "Supabase initialized: true"

## 🎯 What Changed

### Background Script (`chrome-extension/src/background/index.ts`)

1. **Added FlashcardsMessage Interface**: Type-safe message handling for flashcards operations
2. **Updated saveTranslation function**: Now saves `original_language` and `translation_language` columns
3. **Added Flashcards Message Handlers**:
   - `list`: Fetches all flashcards for the authenticated user
   - `delete`: Deletes a specific flashcard by ID
   - `clearAll`: Deletes all flashcards for the user
4. **Updated checkSupabaseCache**: Now includes language columns in queries

### Database Schema

The `flashcards` table now includes:
- `original_language`: Language of the original word (default: 'auto' for auto-detection)
- `translation_language`: Target language for the translation

## 🧪 Testing

After setup, test these features:

1. **Translation with Language Tracking**:
   - Highlight a word on any webpage
   - The translation should be saved with language columns

2. **View Flashcards** (in Popup or New Tab page):
   - Should load all flashcards from Supabase
   - Each flashcard now tracks both languages

3. **Delete Operations**:
   - Delete individual flashcards
   - Clear all flashcards
   - Both should work through the popup interface

## 📊 Database Structure

Your `flashcards` table should have these columns:
- `id` (uuid, primary key)
- `created_at` (timestamp)
- `user_id` (uuid, foreign key to auth.users)
- `original` (text)
- `translation` (text)
- `context` (text, nullable)
- `url` (text, nullable)
- `date` (timestamp)
- `original_language` (text) ← **NEW**
- `translation_language` (text) ← **NEW**

## 🐛 Troubleshooting

### Issue: "Supabase insert error"
- Check that the database columns exist (run the migration SQL)
- Verify your Supabase key is correct in `.env`
- Check Supabase logs for more details

### Issue: "Not authenticated"
- Make sure you're signed in through the popup
- Check "Remember me" to persist session
- Refresh the extension if needed

### Issue: Environment variables not loading
- Ensure `.env` file is in the project root
- Restart the dev server after adding/changing `.env`
- On Windows, you may need to restart your terminal

## 📝 Notes

- The `original_language` is currently set to `'auto'` (auto-detect)
- To get actual detected language, you would need to parse DeepL's response (they provide source language info)
- The translation language comes from the user's settings (default: 'en')




