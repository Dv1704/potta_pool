
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configuration
const BASE_URL = 'http://localhost:3000';
const SECRET = process.env.PAYSTACK_SECRET_KEY || 'test_secret'; // Ensure this matches server
const USER_EMAIL = 'test_user_' + Date.now() + '@example.com';

async function runTest() {
    console.log(">>> Starting Idempotency Test <<<");

    // 1. Setup Data - Create a User
    console.log("Creating Test User...");
    let user;
    try {
        user = await prisma.user.create({
            data: {
                email: USER_EMAIL,
                wallet: {
                    create: {
                        availableBalance: 0,
                        currency: 'GHS'
                    }
                }
            },
            include: { wallet: true }
        });
        console.log(`User created: ${user.id} (${user.email})`);
    } catch (e) {
        console.error("Failed to create user (DB might not be running or schema issue):", e.message);
        return; // Cannot proceed without DB
    }

    // 2. Prepare Webhook Payload
    const reference = `ref_${Date.now()}`;
    const payload = {
        event: "charge.success",
        data: {
            id: Math.floor(Math.random() * 1000000),
            domain: "test",
            status: "success",
            reference: reference,
            amount: 5000, // 50.00 currency units (e.g., GHS or USD)
            message: null,
            gateway_response: "Successful",
            currency: "GHS",
            channel: "card",
            customer: {
                email: USER_EMAIL,
                first_name: "Test",
                last_name: "User"
            }
        }
    };
    const payloadString = JSON.stringify(payload);

    // Generate Signature
    // NOTE: In production, both sides share SECRET. Here we assume server is started with same SECRET.
    const signature = crypto.createHmac('sha512', SECRET).update(payloadString).digest('hex');

    // Helper function to send webhook
    const sendWebhook = async (attempt) => {
        console.log(`\n--- Sending Webhook (Attempt ${attempt}) ---`);
        try {
            const res = await fetch(`${BASE_URL}/api/webhooks/paystack`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-paystack-signature': signature
                },
                body: payloadString
            });
            console.log(`Response Status: ${res.status}`);
            const text = await res.text();
            console.log(`Response Body: ${text}`);
            return res.status;
        } catch (e) {
            console.error("Request Failed:", e.message);
            return 500;
        }
    };

    // 3. Execute Tests

    // Attempt 1: Should Succeed and Credit Validation
    await sendWebhook(1);

    // Check balance
    let wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    console.log(`Balance after 1st call: ${wallet.availableBalance} (Expected 50.00)`);
    if (wallet.availableBalance !== 50) console.error("FAILED: Balance incorrect");

    // Attempt 2: Should Succeed (200 OK) but NO Credit
    await sendWebhook(2);

    wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    console.log(`Balance after 2nd call: ${wallet.availableBalance} (Expected 50.00)`);
    if (wallet.availableBalance !== 50) console.error("FAILED: Balance changed unexpectedly");

    // Attempt 3: Should Succeed (200 OK) but NO Credit
    await sendWebhook(3);

    wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    console.log(`Balance after 3rd call: ${wallet.availableBalance} (Expected 50.00)`);
    if (wallet.availableBalance !== 50) console.error("FAILED: Balance changed unexpectedly");

    console.log("\n>>> Test Complete <<<");

    // Cleanup (optional)
    // await prisma.user.delete({ where: { id: user.id } });
}

runTest()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
