'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Target, Plus, Trash2, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

export default function SavingsGoals() {
  const router = useRouter()
  const [goals, setGoals] = useState([
    { id: 1, name: 'Emergency Fund', target: 100000, current: 35000, deadline: '2024-12-31' },
    { id: 2, name: 'School Fees', target: 50000, current: 15000, deadline: '2025-01-15' },
  ])
  const [showModal, setShowModal] = useState(false)
  const [newGoal, setNewGoal] = useState({ name: '', target: '', deadline: '' })

  const addGoal = () => {
    if (!newGoal.name || !newGoal.target) return toast.error('Fill all fields')
    setGoals([...goals, { ...newGoal, id: Date.now(), current: 0, target: Number(newGoal.target) }])
    setShowModal(false)
    setNewGoal({ name: '', target: '', deadline: '' })
    toast.success('Goal created!')
  }

  const deleteGoal = (id: number) => {
    setGoals(goals.filter(g => g.id !== id))
    toast.success('Goal deleted')
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4">
        <button onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-bold">Savings Goals</h1>
      </div>

      <div className="p-4 max-w-md mx-auto">
        <button onClick={() => setShowModal(true)} className="w-full bg-[#D4AF37] text-[#1A2A4F] py-3 rounded-lg font-semibold flex items-center justify-center gap-2 mb-6">
          <Plus className="h-4 w-4" /> Create New Goal
        </button>

        {goals.map(goal => {
          const progress = (goal.current / goal.target) * 100
          return (
            <div key={goal.id} className="bg-white rounded-xl p-5 mb-4">
              <div className="flex justify-between items-start mb-3">
                <div><h3 className="font-semibold">{goal.name}</h3><p className="text-xs text-gray-500">Due {new Date(goal.deadline).toLocaleDateString()}</p></div>
                <button onClick={() => deleteGoal(goal.id)}><Trash2 className="h-4 w-4 text-red-500" /></button>
              </div>
              <div className="flex justify-between text-sm mb-1"><span>KES {goal.current.toLocaleString()}</span><span>KES {goal.target.toLocaleString()}</span></div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2"><div className="bg-[#D4AF37] rounded-full h-2" style={{ width: `${progress}%` }}></div></div>
              <div className="flex justify-between text-xs"><span>{progress.toFixed(0)}% completed</span><span>KES {(goal.target - goal.current).toLocaleString()} to go</span></div>
              <button className="w-full mt-3 bg-[#1A2A4F] text-white py-2 rounded-lg text-sm">Contribute</button>
            </div>
          )
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4">Create Savings Goal</h3>
            <input type="text" placeholder="Goal name" value={newGoal.name} onChange={(e) => setNewGoal({...newGoal, name: e.target.value})} className="w-full p-3 border rounded-lg mb-3" />
            <input type="number" placeholder="Target amount (KES)" value={newGoal.target} onChange={(e) => setNewGoal({...newGoal, target: e.target.value})} className="w-full p-3 border rounded-lg mb-3" />
            <input type="date" value={newGoal.deadline} onChange={(e) => setNewGoal({...newGoal, deadline: e.target.value})} className="w-full p-3 border rounded-lg mb-4" />
            <div className="flex gap-3"><button onClick={addGoal} className="flex-1 bg-[#D4AF37] text-[#1A2A4F] py-2 rounded-lg">Create</button><button onClick={() => setShowModal(false)} className="flex-1 border py-2 rounded-lg">Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
