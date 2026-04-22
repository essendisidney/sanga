import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

export interface StatementMember {
  full_name: string | null
  phone: string | null
  member_number: string | null
  balance: number | null
}

export interface StatementTransaction {
  id?: string | number
  type: string
  amount: number | null
  balance_before?: number | null
  balance_after?: number | null
  description?: string | null
  created_at: string
}

// Signed classification. Anything not listed is treated as non-balance-moving
// so it appears on the statement but doesn't corrupt the running total.
const CREDIT_TYPES = new Set(['deposit', 'interest', 'dividend', 'loan_disbursement'])
const DEBIT_TYPES = new Set(['withdrawal', 'loan_repayment', 'transfer', 'fee'])

function safeAmount(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

function fmt(n: number | null | undefined): string {
  return safeAmount(n).toLocaleString()
}

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 10 },
  header: { backgroundColor: '#1A2A4F', padding: 20, marginBottom: 20 },
  headerTitle: { color: '#D4AF37', fontSize: 24, textAlign: 'center' },
  headerSubtitle: { color: 'white', fontSize: 12, textAlign: 'center', marginTop: 5 },
  section: { marginBottom: 15 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    backgroundColor: '#f0f0f0',
    padding: 5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginTop: 10,
    backgroundColor: '#f5f5f5',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 8,
    color: '#666',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 14,
    right: 30,
    fontSize: 8,
    color: '#666',
  },
})

export function generateStatementPDF(
  member: StatementMember,
  transactions: StatementTransaction[],
  startDate: string,
  endDate: string
) {
  const list = transactions.filter((t) => t && typeof t.type === 'string')

  let totalCredits = 0
  let totalDebits = 0
  for (const t of list) {
    const amt = safeAmount(t.amount)
    if (CREDIT_TYPES.has(t.type)) totalCredits += amt
    else if (DEBIT_TYPES.has(t.type)) totalDebits += amt
  }

  // Prefer the ledger's own opening snapshot (balance_before of the first
  // transaction in the window) when available. Otherwise fall back to
  // closing - net-movement-in-window, which is only correct when every
  // transaction's type is accounted for in CREDIT_TYPES/DEBIT_TYPES above.
  const closingBalance = safeAmount(member.balance)
  const firstWithBalance = list.find((t) => typeof t.balance_before === 'number')
  const openingBalance =
    firstWithBalance && typeof firstWithBalance.balance_before === 'number'
      ? firstWithBalance.balance_before
      : closingBalance - totalCredits + totalDebits

  const HeaderRow = (
    <View style={[styles.row, { backgroundColor: '#f0f0f0' }]} fixed>
      <Text style={{ width: '25%' }}>Date</Text>
      <Text style={{ width: '45%' }}>Description</Text>
      <Text style={{ width: '15%', textAlign: 'right' }}>Debit</Text>
      <Text style={{ width: '15%', textAlign: 'right' }}>Credit</Text>
    </View>
  )

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.headerTitle}>SANGA</Text>
          <Text style={styles.headerSubtitle}>Connecting Africa&apos;s Wealth</Text>
        </View>

        <View style={styles.section}>
          <Text>
            Statement Period: {new Date(startDate).toLocaleDateString()} -{' '}
            {new Date(endDate).toLocaleDateString()}
          </Text>
          <Text>Generated: {new Date().toLocaleString()}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Member Information</Text>
          <View style={styles.row}>
            <Text>Name:</Text>
            <Text>{member.full_name || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text>Member No:</Text>
            <Text>{member.member_number || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text>Phone:</Text>
            <Text>{member.phone || '—'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          {HeaderRow}
          {list.length === 0 ? (
            <View style={styles.row}>
              <Text style={{ width: '100%', textAlign: 'center', color: '#888' }}>
                No transactions in this period.
              </Text>
            </View>
          ) : (
            list.map((tx, i) => {
              const isDebit = DEBIT_TYPES.has(tx.type)
              const isCredit = CREDIT_TYPES.has(tx.type)
              return (
                <View key={tx.id ?? i} style={styles.row} wrap={false}>
                  <Text style={{ width: '25%' }}>
                    {new Date(tx.created_at).toLocaleDateString()}
                  </Text>
                  <Text style={{ width: '45%' }} hyphenationCallback={(w) => [w]}>
                    {(tx.description || tx.type || '').slice(0, 140)}
                  </Text>
                  <Text style={{ width: '15%', textAlign: 'right' }}>
                    {isDebit ? `KES ${fmt(tx.amount)}` : '-'}
                  </Text>
                  <Text style={{ width: '15%', textAlign: 'right' }}>
                    {isCredit ? `KES ${fmt(tx.amount)}` : '-'}
                  </Text>
                </View>
              )
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.row}>
            <Text>Opening Balance:</Text>
            <Text>KES {fmt(openingBalance)}</Text>
          </View>
          <View style={styles.row}>
            <Text>Total Credits:</Text>
            <Text style={{ color: 'green' }}>KES {fmt(totalCredits)}</Text>
          </View>
          <View style={styles.row}>
            <Text>Total Debits:</Text>
            <Text style={{ color: 'red' }}>KES {fmt(totalDebits)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={{ fontWeight: 'bold' }}>Closing Balance:</Text>
            <Text style={{ fontWeight: 'bold' }}>KES {fmt(closingBalance)}</Text>
          </View>
        </View>

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
        <View style={styles.footer} fixed>
          <Text>This is an electronically generated statement. No signature required.</Text>
          <Text>&copy; 2026 SANGA Financial Network. All rights reserved.</Text>
        </View>
      </Page>
    </Document>
  )
}
