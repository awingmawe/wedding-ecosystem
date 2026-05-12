import { InvitationView } from '../[eventSlug]/invitation-view';
import type { InvitationPageData } from '@/lib/api';

/**
 * Preview page with mock data for development.
 * Access at: http://localhost:3001/preview
 * No backend API required.
 */

const mockData: InvitationPageData = {
  event: {
    id: 'preview-event-001',
    slug: 'andi-dan-sari',
    bride_name: 'Sari Wulandari',
    groom_name: 'Andi Pratama',
    event_date: '2026-03-15',
    venue_name: 'The Ritz-Carlton Jakarta',
    venue_address: 'Jl. DR. Ide Anak Agung Gde Agung Kav. E.1.1 No.1, Jakarta',
    venue_maps_url: 'https://maps.google.com/?q=The+Ritz-Carlton+Jakarta',
    akad_start: '08:00',
    akad_end: '10:00',
    resepsi_start: '11:00',
    resepsi_end: '14:00',
    status: 'published',
  },
  guest: {
    id: 'preview-guest-001',
    name: 'Budi Santoso & Keluarga',
    slug: 'budi-santoso',
    group: 'family',
    plus_one_count: 2,
  },
  theme: {
    primary_color: '#5F7161',
    secondary_color: '#A7C4A0',
    accent_color: '#C9A96E',
    background_color: '#FDFCF9',
    text_color: '#2D3436',
    font_family: 'Poppins',
    font_heading: 'Playfair Display',
    template_id: 'classic-sage-gold',
  },
  sections: [
    {
      id: 's-cover',
      event_id: 'preview-event-001',
      section_type: 'cover',
      sort_order: 1,
      is_active: true,
      content: {
        title: 'Sari & Andi',
        subtitle: 'We are getting married',
        opening_text: 'Undangan Pernikahan',
      },
    },
    {
      id: 's-bride-groom',
      event_id: 'preview-event-001',
      section_type: 'bride_groom',
      sort_order: 2,
      is_active: true,
      content: {
        bride: {
          name: 'Sari Wulandari, S.Kom',
          parent_info: 'Putri dari Bpk. Hadi Wulandari & Ibu Sri Rahayu',
          photo: 'https://placehold.co/300x400/A7C4A0/2D3436?text=Sari',
          instagram: '@sariwulandari',
        },
        groom: {
          name: 'Andi Pratama, S.T.',
          parent_info: 'Putra dari Bpk. Joko Pratama & Ibu Dewi Lestari',
          photo: 'https://placehold.co/300x400/5F7161/FDFCF9?text=Andi',
          instagram: '@andipratama',
        },
      },
    },
    {
      id: 's-verse',
      event_id: 'preview-event-001',
      section_type: 'verse',
      sort_order: 3,
      is_active: true,
      content: {
        text: '"Dan di antara tanda-tanda kekuasaan-Nya ialah Dia menciptakan untukmu pasangan hidup dari jenismu sendiri, supaya kamu merasa tenteram kepadanya, dan dijadikan-Nya di antaramu rasa kasih dan sayang."',
        source: 'QS. Ar-Rum: 21',
      },
    },
    {
      id: 's-story',
      event_id: 'preview-event-001',
      section_type: 'story',
      sort_order: 4,
      is_active: true,
      content: {
        chapters: [
          {
            title: 'Pertama Bertemu',
            description: 'Kami pertama kali bertemu di acara reuni kampus pada tahun 2020. Saat itu kami tidak menyangka bahwa pertemuan singkat itu akan membawa kami ke hari ini.',
            date: '2020-08-15',
          },
          {
            title: 'Mulai Dekat',
            description: 'Setelah beberapa bulan saling bertukar pesan, kami mulai sering menghabiskan waktu bersama. Dari ngopi bareng hingga jalan-jalan sore.',
            date: '2021-01-10',
          },
          {
            title: 'Lamaran',
            description: 'Di sebuah malam yang penuh bintang, Andi memberanikan diri untuk melamar Sari. Dan jawabannya adalah... Ya!',
            date: '2025-06-20',
          },
        ],
      },
    },
    {
      id: 's-countdown',
      event_id: 'preview-event-001',
      section_type: 'countdown',
      sort_order: 5,
      is_active: true,
      content: {
        target_date: '2026-03-15T08:00:00+07:00',
      },
    },
    {
      id: 's-akad-resepsi',
      event_id: 'preview-event-001',
      section_type: 'akad_resepsi',
      sort_order: 6,
      is_active: true,
      content: {
        akad: {
          date: '2026-03-15',
          time_start: '08:00',
          time_end: '10:00',
        },
        resepsi: {
          date: '2026-03-15',
          time_start: '11:00',
          time_end: '14:00',
        },
        venue: 'The Ritz-Carlton Jakarta, Pacific Place',
        maps_url: 'https://maps.google.com/?q=The+Ritz-Carlton+Jakarta+Pacific+Place',
      },
    },
    {
      id: 's-attire',
      event_id: 'preview-event-001',
      section_type: 'attire',
      sort_order: 7,
      is_active: true,
      content: {
        description: 'Kami mengundang para tamu untuk mengenakan pakaian formal dengan nuansa warna berikut:',
        color_palette: ['#5F7161', '#A7C4A0', '#C9A96E', '#EBD9D1', '#FDFCF9'],
      },
    },
    {
      id: 's-gallery',
      event_id: 'preview-event-001',
      section_type: 'gallery',
      sort_order: 8,
      is_active: true,
      content: {
        photos: [
          { url: 'https://placehold.co/400x500/A7C4A0/2D3436?text=Foto+1', caption: 'Prewedding 1', order: 1 },
          { url: 'https://placehold.co/400x500/5F7161/FDFCF9?text=Foto+2', caption: 'Prewedding 2', order: 2 },
          { url: 'https://placehold.co/400x500/C9A96E/FDFCF9?text=Foto+3', caption: 'Prewedding 3', order: 3 },
          { url: 'https://placehold.co/400x500/EBD9D1/2D3436?text=Foto+4', caption: 'Prewedding 4', order: 4 },
        ],
      },
    },
    {
      id: 's-rsvp',
      event_id: 'preview-event-001',
      section_type: 'rsvp',
      sort_order: 9,
      is_active: true,
      content: {
        options: ['akad', 'resepsi', 'both', 'decline'],
        max_plus_one: 2,
      },
    },
    {
      id: 's-gift',
      event_id: 'preview-event-001',
      section_type: 'gift',
      sort_order: 10,
      is_active: true,
      content: {
        description: 'Doa restu Anda merupakan karunia yang sangat berarti bagi kami. Namun jika Anda ingin memberikan tanda kasih, kami menyediakan:',
        accounts: [
          { bank: 'BCA', account_number: '1234567890', account_name: 'Sari Wulandari' },
          { bank: 'Mandiri', account_number: '0987654321', account_name: 'Andi Pratama' },
        ],
      },
    },
    {
      id: 's-messages',
      event_id: 'preview-event-001',
      section_type: 'messages',
      sort_order: 11,
      is_active: true,
      content: {
        is_enabled: true,
        placeholder_text: 'Tulis ucapan dan doa untuk kedua mempelai...',
      },
    },
    {
      id: 's-closing',
      event_id: 'preview-event-001',
      section_type: 'closing',
      sort_order: 12,
      is_active: true,
      content: {
        text: 'Merupakan suatu kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir untuk memberikan doa restu.',
        thank_you_message: 'Atas kehadiran dan doa restunya, kami ucapkan terima kasih.',
      },
    },
    {
      id: 's-music',
      event_id: 'preview-event-001',
      section_type: 'music',
      sort_order: 13,
      is_active: false,
      content: {
        audio_url: '',
        autoplay: false,
        title: 'Background Music',
      },
    },
  ],
};

export default function PreviewPage() {
  return <InvitationView data={mockData} />;
}
