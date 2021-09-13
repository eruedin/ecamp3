// eslint-disable-next-line no-unused-vars
import React from 'react'
import { Page, Text, View } from '@react-pdf/renderer'
import styles from '@/components/print/styles.js'
import Footer from '@/components/print/Footer.jsx'

function Picasso ({ camp }) {
  return <Page size="A4" orientation="landscape" style={styles.page}>
    <View style={styles.section}>
      <Text style={styles.h1}>Grobprogramm {camp.name} im Querformat</Text>
    </View>
    <Footer/>
  </Page>
}

export default Picasso
