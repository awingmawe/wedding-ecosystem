'use client';

import { MediaUpload } from '../media-upload';

interface BrideGroomFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

interface PersonData {
  name: string;
  parent_info: string;
  photo: string;
  instagram: string;
}

export function BrideGroomForm({ content, onChange }: BrideGroomFormProps) {
  const bride = (content.bride as PersonData) || { name: '', parent_info: '', photo: '', instagram: '' };
  const groom = (content.groom as PersonData) || { name: '', parent_info: '', photo: '', instagram: '' };

  const updatePerson = (role: 'bride' | 'groom', field: keyof PersonData, value: string) => {
    const person = role === 'bride' ? bride : groom;
    onChange({
      ...content,
      [role]: { ...person, [field]: value },
    });
  };

  const handleUpload = async (file: File): Promise<string> => {
    return URL.createObjectURL(file);
  };

  const renderPersonForm = (role: 'bride' | 'groom', label: string) => {
    const person = role === 'bride' ? bride : groom;

    return (
      <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-800">{label}</h3>

        <div>
          <label htmlFor={`${role}-name`} className="block text-sm font-medium text-gray-700">
            Nama Lengkap
          </label>
          <input
            id={`${role}-name`}
            type="text"
            value={person.name}
            onChange={(e) => updatePerson(role, 'name', e.target.value)}
            placeholder="Nama lengkap"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label htmlFor={`${role}-parent`} className="block text-sm font-medium text-gray-700">
            Info Orang Tua
          </label>
          <input
            id={`${role}-parent`}
            type="text"
            value={person.parent_info}
            onChange={(e) => updatePerson(role, 'parent_info', e.target.value)}
            placeholder="Contoh: Putra dari Bapak ... & Ibu ..."
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label htmlFor={`${role}-instagram`} className="block text-sm font-medium text-gray-700">
            Instagram
          </label>
          <input
            id={`${role}-instagram`}
            type="text"
            value={person.instagram}
            onChange={(e) => updatePerson(role, 'instagram', e.target.value)}
            placeholder="@username"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <MediaUpload
          mediaType="image"
          currentUrl={person.photo}
          onUpload={async (file) => {
            const url = await handleUpload(file);
            updatePerson(role, 'photo', url);
            return url;
          }}
          onRemove={() => updatePerson(role, 'photo', '')}
          label="Foto"
        />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderPersonForm('bride', '👰 Mempelai Wanita')}
      {renderPersonForm('groom', '🤵 Mempelai Pria')}
    </div>
  );
}
