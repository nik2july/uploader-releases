import { useState } from 'react'
import { Lock, Phone, Key, Eye, EyeOff } from 'lucide-react'
import { signInWithCustomToken } from 'firebase/auth'
import { auth } from '../lib/auth'
import { BrandLogo } from './common/BrandLogo'

export function Login({ onLogin }: { onLogin: () => void }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await window.api.login(phone.trim(), password)
      await signInWithCustomToken(auth, result.customToken)
      onLogin()
    } catch (err: any) {
      setError(err.message || 'Failed to login.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f9f8f6] flex flex-col items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#d4c1a3]/30 p-8 flex flex-col items-center text-center">
        
        <BrandLogo variant="monogram" theme="burgundy" size="xl" className="mb-6" />
        
        <h1 className="font-['The_Seasons'] font-bold text-3xl mb-2">Baawaray Admin</h1>
        <p className="text-[#6b6660] mb-8">Desktop Application</p>

        {error && (
          <div className="w-full bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4 border border-red-200">
            {error}
          </div>
        )}

        <div className="w-full space-y-4 mb-8">
          <div className="relative">
            <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6660]" />
            <input 
              type="text" 
              placeholder="Admin Phone Number" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#f9f8f6] border border-[#d4c1a3]/50 rounded-xl focus:outline-none focus:border-[#7a2e33] transition-colors"
              required
            />
          </div>
          <div className="relative">
            <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6660]" />
            <input 
              type={showPassword ? 'text' : 'password'} 
              placeholder="Admin Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-3 bg-[#f9f8f6] border border-[#d4c1a3]/50 rounded-xl focus:outline-none focus:border-[#7a2e33] transition-colors"
              required
            />
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6660] hover:text-[#111417] transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button 
          type="submit"
          disabled={loading}
          className="w-full bg-[#7a2e33] hover:bg-[#5a2226] disabled:opacity-50 text-white py-3.5 rounded-xl font-medium transition-colors flex justify-center items-center gap-3"
        >
          {loading ? 'Authenticating...' : 'Sign In securely'}
        </button>

        <div className="mt-8 pt-6 border-t border-[#d4c1a3]/30 w-full flex items-center justify-center gap-2 text-sm text-[#6b6660]">
          <Lock size={14} />
          Encrypted Auth via Firebase
        </div>
      </form>
    </div>
  )
}
