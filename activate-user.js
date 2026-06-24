require('dotenv').config();
const supabase = require('./config/supabase');

async function run() {
  const emails = [
    'test_agent_antigravity@13xinvestments.in',
    'test_agent_antigravity_2@13xinvestments.in',
    'admin@13xinvestments.in'
  ];

  for (const email of emails) {
    console.log(`Activating ${email}...`);
    
    // Find user
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
      
    if (findError) {
      console.error(`Error finding user ${email}:`, findError);
      continue;
    }
    
    if (!user) {
      console.log(`User ${email} not found.`);
      continue;
    }
    
    // Verify email
    const { error: updateError } = await supabase
      .from('users')
      .update({ email_verified: true, email_token: null, token_expires_at: null })
      .eq('id', user.id);
      
    if (updateError) {
      console.error(`Error verifying email for ${email}:`, updateError);
      continue;
    }
    console.log(`Verified email for ${email}.`);
    
    // Give paid subscription
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 2); // 2 years from now
    
    const { error: subError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        plan: 'yearly',
        status: 'active',
        expires_at: expiry.toISOString(),
        razorpay_subscription_id: 'sub_test_antigravity'
      }, { onConflict: 'user_id' });
      
    if (subError) {
      console.error(`Error adding subscription for ${email}:`, subError);
    } else {
      console.log(`Granted active yearly subscription to ${email}.`);
    }
  }
}

run().catch(console.error);
