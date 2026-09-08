// Standard Terms of Service + Privacy template, written specifically for
// what Confía actually does (a personal notes/CRM app that sends
// captured text to Groq, Cohere, and Supabase - named honestly below
// rather than left as generic boilerplate). This is a reasonable starting
// point, not a substitute for a lawyer's review before any real public
// or commercial launch.

export const TERMS_LAST_UPDATED = 'September 2, 2026'

export const TERMS_TEXT = `
_Last updated: ${TERMS_LAST_UPDATED}_

## 1. Acceptance of Terms

By creating an account or using Confía ("the App"), you agree to these Terms of Service and the Privacy section below. If you don't agree, please don't use the App.

## 2. What the App Does

Confía lets you log notes about your conversations and contacts - by typing, speaking, or scanning a business card - and later ask questions about what you've recorded. To do this, the App sends the text you enter (and transcripts of any voice recordings) to third-party AI services for processing, and stores your notes, contacts, and account data with a third-party database provider. These are named specifically in the Privacy section below.

## 3. Your Account

You're responsible for keeping your login credentials secure and for all activity under your account. Let us know if you believe your account has been accessed without your permission.

## 4. Your Content

You retain ownership of the notes, contact details, and other content you enter into the App ("Your Content"). You're solely responsible for Your Content, including making sure you have the right to record and store information about the people you log - for example, being mindful of your own local privacy obligations when noting personal details about someone else.

You grant us a limited license to process, store, and transmit Your Content solely to provide the App's features to you (extracting structured info, answering your questions, generating briefings, and similar). We don't use Your Content to train AI models or share it for advertising.

## 5. Third-Party Services

The App relies on the following third parties to function. Using the App means Your Content (or parts of it) will be sent to them for processing:

- **Groq** - processes your notes and questions to extract structured information and generate answers.
- **Cohere** - generates semantic embeddings of your notes to power search.
- **Supabase** - hosts the database and authentication that stores your account and content.

Each operates under its own terms and privacy policy, which we encourage you to review.

## 6. Privacy

We collect the account information you provide at signup (email), the content you choose to log (notes, transcribed voice recordings, scanned business card details), and, only if you explicitly opt in per note, your device's approximate location. We use this solely to operate the App's features for you - not for advertising, and not sold to third parties.

**Please don't log anything you wouldn't want shared with our AI providers.** As described in Section 5, the content you enter is sent to Groq and Cohere to extract information, answer your questions, and power search - this is necessary for the App to work, and applies to everything you log, not just what you mark as sensitive. Avoid entering things like government ID numbers, passwords, financial account details, or other highly sensitive information you wouldn't want processed by a third-party AI service.

You can request deletion of your account and associated data at any time, from Settings inside the App or, if you can't log in, from [/account-deletion](/account-deletion) - no login required.

## 7. Acceptable Use

You agree not to use the App to store or process content that is unlawful, infringes someone else's rights, or that you don't have a legitimate basis to record (for example, covertly recording someone in a context where consent is legally required).

## 8. Disclaimer of Warranties

The App is provided "as is" and "as available," without warranties of any kind. AI-generated summaries and answers may be inaccurate or incomplete - always verify anything important before relying on it.

## 9. Limitation of Liability

To the maximum extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the App, including loss of data.

## 10. Changes to These Terms

We may update these Terms from time to time. Continuing to use the App after a change means you accept the updated Terms.

## 11. Termination

You may stop using the App and request account deletion at any time. We may suspend or terminate access for use that violates these Terms.

## 12. Contact

Questions about these Terms can be directed to the app's maintainer.
`
