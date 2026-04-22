'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Target, TrendingUp, Trash2, Calendar } from 'lucide-react'
import { toast } from 'sonner'

interface SavingsGoal {
  id: string
  name: string
  target_amount: number
  current_amount: number
  deadline: string
  status: string
  progress: number
}

export default function SavingsGoalsPage() {
  const router = useRouter()
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newGoal, setNewGoal] = useState({ name: '', target_amount: '', deadline: '' })

  useEffect(() => {
    fetchGoals()
  }, [])

  async function fetchGoals() {
    try {
      const res = await fetch('/api/savings-goals')
      const data = await res.json()
      setGoals(data)
    } catch (error) {
      toast.error('Failed to load goals')
    } finally {
      setLoading(false)
    }
  }

  async function createGoal() {
    if (!newGoal.name || !newGoal.target_amount) {
      toast.error('Please fill all fields')
      return
    }

    try {
      const res = await fetch('/api/savings-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGoal.name,
          target_amount: Number(newGoal.target_amount),
          deadline: newGoal.deadline
        })
      })

      if (res.ok) {
        toast.success('Goal created!')
        setShowModal(false)
        setNewGoal({ name: '', target_amount: '', deadline: '' })
        fetchGoals()
      } else {
        toast.error('Failed to create goal')
      }
    } catch (error) {
      toast.error('Failed to create goal')
    }
  }

  async function contribute(goalId: string, currentAmount: number, targetAmount: number) {
    const amount = prompt('Enter contribution amount (KES):', '1000')
    if (!amount) return

    const newAmount = currentAmount + Number(amount)
    if (newAmount > targetAmount) {
      toast.error('Contribution exceeds goal target')
      return
    }

    try {
      const res = await fetch('/api/savings-goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: goalId, current_amount: newAmount })
      })

      if (res.ok) {
        toast.success(`Added KES ${amount} to goal!`)
        fetchGoals()
      } else {
        toast.error('Failed to contribute')
      }
    } catch (error) {
      toast.error('Failed to contribute')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></button>
          <h1 className="text-xl font-bold">Savings Goals</h1>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-[#D4AF37] text-[#1A2A4F] p-2 rounded-lg">
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <div className="p-4 max-w-md mx-auto">
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : goals.length === 0 ? (
          <div className="text-center py-12">
            <Target className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No savings goals yet</p>
            <button onClick={() => setShowModal(true)} className="mt-4 text-[#D4AF37]">Create your first goal →</button>
          </div>
        ) : (
          goals.map((goal) => {
            const progress = (goal.current_amount / goal.target_amount) * 100
            return (
              <div key={goal.id} className="bg-white rounded-xl p-5 mb-4 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{goal.name}</h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <Calendar className="h-3 w-3" /> Due {new Date(goal.deadline).toLocaleDateString()}
                    </p>
                  </div>
                  <button className="p-1 hover:bg-gray-100 rounded"><Trash2 className="h-4 w-4 text-red-500" /></button>
                </div>

                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span>KES {goal.current_amount.toLocaleString()}</span>
                    <span>KES {goal.target_amount.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className="bg-[#D4AF37] rounded-full h-2.5" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>

                <div className="flex justify-between items-center mt-3">
                  <p className="text-xs text-gray-500">{progress.toFixed(0)}% completed</p>
                  <p className="text-xs font-medium text-green-600">
                    KES {(goal.target_amount - goal.current_amount).toLocaleString()} to go
                  </p>
                </div>

                <button
                  onClick={() => contribute(goal.id, goal.current_amount, goal.target_amount)}
                  className="w-full mt-3 bg-[#1A2A4F] text-white py-2 rounded-lg text-sm"
                >
                  Add Contribution
                </button>
              </div>
            )
          })
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4">Create Savings Goal</h3>
            <input
              type="text"
              placeholder="Goal name (e.g., Emergency Fund)"
              value={newGoal.name}
              onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
              className="w-full p-3 border rounded-lg mb-3"
            />
            <input
              type="number"
              placeholder="Target amount (KES)"
              value={newGoal.target_amount}
              onChange={(e) => setNewGoal({ ...newGoal, target_amount: e.target.value })}
              className="w-full p-3 border rounded-lg mb-3"
            />
            <input
              type="date"
              value={newGoal.deadline}
              onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
              className="w-full p-3 border rounded-lg mb-4"
            />
            <div className="flex gap-3">
              <button onClick={createGoal} className="flex-1 bg-[#D4AF37] text-[#1A2A4F] py-2 rounded-lg">Create</button>
              <button onClick={() => setShowModal(false)} className="flex-1 border py-2 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
