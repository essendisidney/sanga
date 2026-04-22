import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 10 },
  header: { backgroundColor: '#1A2A4F', padding: 20, marginBottom: 20 },
  headerTitle: { color: '#D4AF37', fontSize: 24, textAlign: 'center' },
  headerSubtitle: { color: 'white', fontSize: 12, textAlign: 'center', marginTop: 5 },
  section: { marginBottom: 15 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 10, backgroundColor: '#f0f0f0', padding: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, marginTop: 10, backgroundColor: '#f5f5f5' },
  amount: { fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 30, left: 30, right: 30, textAlign: 'center', fontSize: 8, color: '#666' }
})

export function generateStatementPDF(member: any, transactions: any[], startDate: string, endDate: string) {
  const totalDeposits = transactions.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0)
  const totalWithdrawals = transactions.filter(t => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0)
  const closingBalance = member.balance
  const openingBalance = closingBalance - totalDeposits + totalWithdrawals

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>SANGA</Text>
          <Text style={styles.headerSubtitle}>Connecting Africa&apos;s Wealth</Text>
        </View>

        <View style={styles.section}>
          <Text>Statement Period: {new Date(startDate).toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}</Text>
          <Text>Generated: {new Date().toLocaleString()}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Member Information</Text>
          <View style={styles.row}><Text>Name:</Text><Text>{member.full_name}</Text></View>
          <View style={styles.row}><Text>Member No:</Text><Text>{member.member_number}</Text></View>
          <View style={styles.row}><Text>Phone:</Text><Text>{member.phone}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          <View style={[styles.row, { backgroundColor: '#f0f0f0' }]}>
            <Text style={{ width: '25%' }}>Date</Text>
            <Text style={{ width: '45%' }}>Description</Text>
            <Text style={{ width: '15%', textAlign: 'right' }}>Debit</Text>
            <Text style={{ width: '15%', textAlign: 'right' }}>Credit</Text>
          </View>
          {transactions.map((tx, i) => (
            <View key={i} style={styles.row}>
              <Text style={{ width: '25%' }}>{new Date(tx.created_at).toLocaleDateString()}</Text>
              <Text style={{ width: '45%' }}>{tx.description || tx.type}</Text>
              <Text style={{ width: '15%', textAlign: 'right' }}>{tx.type === 'withdrawal' ? `KES ${tx.amount.toLocaleString()}` : '-'}</Text>
              <Text style={{ width: '15%', textAlign: 'right' }}>{tx.type === 'deposit' ? `KES ${tx.amount.toLocaleString()}` : '-'}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.row}><Text>Opening Balance:</Text><Text>KES {openingBalance.toLocaleString()}</Text></View>
          <View style={styles.row}><Text>Total Deposits:</Text><Text style={{ color: 'green' }}>KES {totalDeposits.toLocaleString()}</Text></View>
          <View style={styles.row}><Text>Total Withdrawals:</Text><Text style={{ color: 'red' }}>KES {totalWithdrawals.toLocaleString()}</Text></View>
          <View style={styles.totalRow}><Text style={{ fontWeight: 'bold' }}>Closing Balance:</Text><Text style={{ fontWeight: 'bold' }}>KES {closingBalance.toLocaleString()}</Text></View>
        </View>

        <View style={styles.footer}>
          <Text>This is an electronically generated statement. No signature required.</Text>
          <Text>© 2026 SANGA Financial Network. All rights reserved.</Text>
        </View>
      </Page>
    </Document>
  )
}
