'use client';

interface GiftFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

interface BankAccount {
  bank: string;
  account_number: string;
  account_name: string;
}

export function GiftForm({ content, onChange }: GiftFormProps) {
  const accounts = (content.accounts as BankAccount[]) || [];
  const description = (content.description as string) || '';

  const addAccount = () => {
    onChange({
      ...content,
      accounts: [...accounts, { bank: '', account_number: '', account_name: '' }],
    });
  };

  const updateAccount = (index: number, field: keyof BankAccount, value: string) => {
    const updated = [...accounts];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...content, accounts: updated });
  };

  const removeAccount = (index: number) => {
    const updated = accounts.filter((_, i) => i !== index);
    onChange({ ...content, accounts: updated });
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="gift-desc" className="block text-sm font-medium text-gray-700">
          Deskripsi
        </label>
        <textarea
          id="gift-desc"
          value={description}
          onChange={(e) => onChange({ ...content, description: e.target.value })}
          placeholder="Contoh: Doa restu Anda merupakan karunia yang sangat berarti bagi kami. Namun jika Anda ingin memberikan tanda kasih..."
          rows={3}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">Rekening</label>
        <button
          type="button"
          onClick={addAccount}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tambah Rekening
        </button>
      </div>

      {accounts.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500">Belum ada rekening. Klik tombol di atas untuk menambahkan.</p>
        </div>
      )}

      {accounts.map((account, index) => (
        <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700">Rekening {index + 1}</h4>
            <button
              type="button"
              onClick={() => removeAccount(index)}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Hapus
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Nama Bank</label>
            <input
              type="text"
              value={account.bank}
              onChange={(e) => updateAccount(index, 'bank', e.target.value)}
              placeholder="Contoh: BCA, Mandiri, BNI"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Nomor Rekening</label>
            <input
              type="text"
              value={account.account_number}
              onChange={(e) => updateAccount(index, 'account_number', e.target.value)}
              placeholder="1234567890"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Atas Nama</label>
            <input
              type="text"
              value={account.account_name}
              onChange={(e) => updateAccount(index, 'account_name', e.target.value)}
              placeholder="Nama pemilik rekening"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
