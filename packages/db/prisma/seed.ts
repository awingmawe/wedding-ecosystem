import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import 'dotenv/config';

// Guard: prevent running seed in production
if (process.env.NODE_ENV === 'production') {
  console.error('❌ Seed script cannot be run in production environment.');
  console.error('   Set NODE_ENV to "development" or "test" to run seeds.');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required.');
  console.error('   Set it in your .env file or environment.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const SECTION_TYPES = [
  'cover',
  'bride_groom',
  'story',
  'verse',
  'countdown',
  'akad_resepsi',
  'rsvp',
  'attire',
  'gallery',
  'video',
  'gift',
  'messages',
  'closing',
  'music',
] as const;

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.checkIn.deleteMany();
  await prisma.rSVP.deleteMany();
  await prisma.qRCode.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.invitationSection.deleteMany();
  await prisma.eventConfig.deleteMany();
  await prisma.scannerDevice.deleteMany();
  await prisma.message.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  // 1. Create tenant
  const tenantId = randomUUID();
  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      name: 'Wedding Demo',
      slug: 'wedding-demo',
      plan_type: 'premium',
      is_active: true,
    },
  });
  console.log(`✅ Tenant created: ${tenant.name} (${tenant.id})`);

  // 2. Create user
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash('password123', 10);
  const user = await prisma.user.create({
    data: {
      id: userId,
      tenant_id: tenantId,
      email: 'admin@demo.com',
      password_hash: passwordHash,
      role: 'client',
      name: 'Admin Demo',
    },
  });
  console.log(`✅ User created: ${user.email} (password: password123)`);

  // 3. Create event
  const eventId = randomUUID();
  const event = await prisma.event.create({
    data: {
      id: eventId,
      tenant_id: tenantId,
      slug: 'romeo-juliet',
      bride_name: 'Juliet',
      groom_name: 'Romeo',
      event_date: new Date('2026-01-12T00:00:00Z'),
      venue_name: 'Grand Ballroom Hotel Mulia',
      venue_address: 'Jl. Asia Afrika No. 8, Jakarta Selatan',
      venue_maps_url: 'https://maps.google.com/?q=Grand+Ballroom+Hotel+Mulia',
      akad_start: '08:00',
      akad_end: '10:00',
      resepsi_start: '11:00',
      resepsi_end: '14:00',
      status: 'published',
    },
  });
  console.log(`✅ Event created: ${event.groom_name} & ${event.bride_name} (${event.slug})`);

  // 4. Create 14 invitation sections
  for (let i = 0; i < SECTION_TYPES.length; i++) {
    await prisma.invitationSection.create({
      data: {
        id: randomUUID(),
        event_id: eventId,
        section_type: SECTION_TYPES[i],
        sort_order: i + 1,
        is_active: true,
        content: {},
      },
    });
  }
  console.log(`✅ 14 invitation sections created`);

  // 5. Create 5 sample guests with QR codes
  const guestData = [
    { name: 'Budi Santoso', group: 'family', phone: '+6281234567890', email: 'budi@example.com' },
    { name: 'Siti Rahayu', group: 'family', phone: '+6281234567891', email: 'siti@example.com' },
    { name: 'Ahmad Fauzi', group: 'friend', phone: '+6281234567892', email: null },
    { name: 'Dewi Lestari', group: 'colleague', phone: null, email: 'dewi@example.com' },
    { name: 'Rudi Hermawan', group: 'vip', phone: '+6281234567894', email: 'rudi@example.com' },
  ];

  const guestIds: string[] = [];

  for (const g of guestData) {
    const guestId = randomUUID();
    guestIds.push(guestId);

    const slug = g.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');

    await prisma.guest.create({
      data: {
        id: guestId,
        event_id: eventId,
        tenant_id: tenantId,
        name: g.name,
        slug,
        phone: g.phone,
        email: g.email,
        group: g.group as any,
        type: 'invited',
        plus_one_count: 1,
        invitation_url: `/${event.slug}?to=${slug}`,
        delivery_status: 'not_sent',
      },
    });

    // Create QR code
    await prisma.qRCode.create({
      data: {
        id: randomUUID(),
        guest_id: guestId,
        qr_payload: `${guestId}:${eventId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        is_active: true,
      },
    });
  }
  console.log(`✅ 5 sample guests created with QR codes`);

  // 6. Create 2 sample RSVPs
  await prisma.rSVP.create({
    data: {
      id: randomUUID(),
      guest_id: guestIds[0],
      attendance: 'both',
      guest_count: 2,
    },
  });

  await prisma.rSVP.create({
    data: {
      id: randomUUID(),
      guest_id: guestIds[1],
      attendance: 'resepsi',
      guest_count: 1,
    },
  });
  console.log(`✅ 2 sample RSVPs created`);

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Login credentials:');
  console.log('   Email: admin@demo.com');
  console.log('   Password: password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
