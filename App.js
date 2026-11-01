// Event Planner App – React Native (Expo) | Luxury theme: ink + champagne gold + ivory
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, Platform, StatusBar,
  StyleSheet, ScrollView, SafeAreaView, KeyboardAvoidingView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import DateTimePicker from '@react-native-community/datetimepicker';

const C = { bg: '#0E0D12', card: '#18171E', line: '#2E2B36', gold: '#C9A96E', ivory: '#F3EDE0', mute: '#8A8576', red: '#C0645C' };
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif' });
const KEY = 'events_v1';
const REMINDERS = [{ l: 'No reminder', m: null }, { l: 'At event time', m: 0 }, { l: '10 min before', m: 10 },
  { l: '1 hour before', m: 60 }, { l: '1 day before', m: 1440 }];

Notifications.setNotificationHandler({ handleNotification: async () => ({
  shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Ask for notification permission (Android 13+ needs a channel first)
let channelOk = false;
async function ensurePermission() {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('events', {
        name: 'Events', importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250], lightColor: '#C9A96E' });
      channelOk = true;
    } catch (e) { channelOk = false; } // Expo Go bug: don't crash, use default channel
  }
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    return status === 'granted';
  } catch (e) { return false; }
}

// Schedule a local notification; returns notification id or null
async function scheduleReminder(ev) {
  if (ev.remindMin === null) return null;
  const when = new Date(new Date(ev.date).getTime() - ev.remindMin * 60000);
  if (when <= new Date()) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title: ev.name, body: ev.remindMin ? `Begins at ${fmtTime(new Date(ev.date))}` : 'Your event is starting now' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, ...(channelOk ? { channelId: 'events' } : {}) },
  });
}

export default function App() {
  const [events, setEvents] = useState([]);
  const [tab, setTab] = useState('upcoming');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | event object

  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => v && setEvents(JSON.parse(v))).catch(() => {}); }, []);
  const persist = (list) => { setEvents(list); AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {}); };

  const shown = useMemo(() => {
    const now = new Date(); const q = query.trim().toLowerCase();
    return events
      .filter((e) => (tab === 'upcoming') === (new Date(e.date) >= now))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || ymd(new Date(e.date)).includes(q) || fmtDate(new Date(e.date)).toLowerCase().includes(q))
      .sort((a, b) => (tab === 'upcoming' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date)));
  }, [events, tab, query]);

  const save = async (ev) => {
    const old = events.find((e) => e.id === ev.id);
    if (old?.notifId) await Notifications.cancelScheduledNotificationAsync(old.notifId).catch(() => {});
    let notifId = null;
    if (ev.remindMin !== null) {
      if (await ensurePermission()) {
        notifId = await scheduleReminder(ev);
        if (!notifId) Alert.alert('Reminder skipped', 'That reminder time has already passed.');
      } else Alert.alert('Notifications off', 'Allow notifications in settings to receive reminders.');
    }
    const saved = { ...ev, notifId };
    persist(old ? events.map((e) => (e.id === ev.id ? saved : e)) : [...events, saved]);
    setEditing(null);
  };

  const remove = (ev) => Alert.alert('Delete event', `Delete "${ev.name}"? This cannot be undone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      if (ev.notifId) await Notifications.cancelScheduledNotificationAsync(ev.notifId).catch(() => {});
      persist(events.filter((e) => e.id !== ev.id)); } },
  ]);

  if (editing) return <EventForm initial={editing === 'new' ? null : editing} onSave={save} onCancel={() => setEditing(null)} />;

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <Text style={s.title}>My Events</Text>
        <Text style={s.sub}>Your private event planner</Text>
      </View>
      <TextInput style={s.search} placeholder="Search by name or date (2026-12-31)" placeholderTextColor={C.mute}
        value={query} onChangeText={setQuery} />
      <View style={s.tabs}>
        {['upcoming', 'past'].map((t) => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabOn]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab === t && { color: C.bg }]}>{t === 'upcoming' ? 'Upcoming' : 'Past'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList data={shown} keyExtractor={(e) => e.id} contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        ListEmptyComponent={<Text style={s.empty}>{query ? 'No events match your search.' : tab === 'upcoming' ? 'No upcoming events.\nTap + to plan your first one.' : 'No past events yet.'}</Text>}
        renderItem={({ item }) => {
          const d = new Date(item.date);
          return (
            <View style={s.card}>
              <View style={s.dateBox}><Text style={s.day}>{d.getDate()}</Text><Text style={s.mon}>{d.toLocaleDateString(undefined, { month: 'short' })}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name}</Text>
                <Text style={s.meta}>{fmtTime(d)}{item.remindMin !== null ? '  •  Reminder on' : ''}</Text>
                {!!item.description && <Text style={s.desc} numberOfLines={2}>{item.description}</Text>}
                <View style={s.row}>
                  <TouchableOpacity onPress={() => setEditing(item)}><Text style={s.link}>Edit</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(item)}><Text style={[s.link, { color: C.red }]}>Delete</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }} />
      <TouchableOpacity style={s.fab} onPress={() => setEditing('new')}><Text style={s.fabTxt}>+</Text></TouchableOpacity>
    </SafeAreaView>
  );
}

function EventForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [date, setDate] = useState(initial ? new Date(initial.date) : new Date(Date.now() + 3600000));
  const [remindMin, setRemindMin] = useState(initial ? initial.remindMin : 10);
  const [picker, setPicker] = useState(null);
  const [err, setErr] = useState({});

  const onPick = (_, v) => { if (Platform.OS === 'android') setPicker(null); if (v) { const n = new Date(date);
    if (picker === 'date') n.setFullYear(v.getFullYear(), v.getMonth(), v.getDate()); else n.setHours(v.getHours(), v.getMinutes(), 0, 0);
    setDate(n); } };

  const submit = () => {
    const e = {};
    if (name.trim().length < 3) e.name = 'Enter a name with at least 3 characters.';
    if (name.trim().length > 60) e.name = 'Name must be 60 characters or fewer.';
    if (description.length > 300) e.description = 'Description must be 300 characters or fewer.';
    if (!initial && date <= new Date()) e.date = 'Choose a date and time in the future.';
    setErr(e);
    if (Object.keys(e).length) return;
    onSave({ id: initial?.id || String(Date.now()), name: name.trim(), description: description.trim(), date: date.toISOString(), remindMin });
  };

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <Text style={s.title}>{initial ? 'Edit event' : 'New event'}</Text>
          <Text style={s.lbl}>Event name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Gala dinner" placeholderTextColor={C.mute} />
          {!!err.name && <Text style={s.err}>{err.name}</Text>}
          <Text style={s.lbl}>Date</Text>
          <TouchableOpacity style={s.input} onPress={() => setPicker('date')}><Text style={s.val}>{fmtDate(date)}</Text></TouchableOpacity>
          <Text style={s.lbl}>Time</Text>
          <TouchableOpacity style={s.input} onPress={() => setPicker('time')}><Text style={s.val}>{fmtTime(date)}</Text></TouchableOpacity>
          {!!err.date && <Text style={s.err}>{err.date}</Text>}
          {picker && <DateTimePicker value={date} mode={picker} is24Hour={false} themeVariant="dark"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPick} />}
          {Platform.OS === 'ios' && picker && <TouchableOpacity onPress={() => setPicker(null)}><Text style={s.link}>Done</Text></TouchableOpacity>}
          <Text style={s.lbl}>Description</Text>
          <TextInput style={[s.input, { height: 100, textAlignVertical: 'top' }]} multiline value={description}
            onChangeText={setDescription} placeholder="Venue, guests, notes" placeholderTextColor={C.mute} />
          {!!err.description && <Text style={s.err}>{err.description}</Text>}
          <Text style={s.lbl}>Reminder</Text>
          <View style={s.chips}>
            {REMINDERS.map((r) => (
              <TouchableOpacity key={r.l} style={[s.chip, remindMin === r.m && s.chipOn]} onPress={() => setRemindMin(r.m)}>
                <Text style={[s.chipTxt, remindMin === r.m && { color: C.bg }]}>{r.l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.btn} onPress={submit}><Text style={s.btnTxt}>{initial ? 'Save changes' : 'Create event'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={onCancel} style={{ alignItems: 'center', padding: 16 }}><Text style={s.link}>Cancel</Text></TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12 },
  title: { fontFamily: SERIF, fontSize: 38, color: C.ivory, letterSpacing: 1 },
  sub: { fontFamily: SERIF, fontStyle: 'italic', color: C.gold, marginTop: 2, fontSize: 15 },
  search: { marginHorizontal: 20, backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 4, color: C.ivory, padding: 12 },
  tabs: { flexDirection: 'row', marginHorizontal: 20, marginTop: 14, gap: 10 },
  tab: { paddingVertical: 8, paddingHorizontal: 20, borderWidth: 1, borderColor: C.gold, borderRadius: 2 },
  tabOn: { backgroundColor: C.gold }, tabTxt: { color: C.gold, fontFamily: SERIF },
  card: { flexDirection: 'row', backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderLeftColor: C.gold, borderLeftWidth: 3, padding: 16, marginBottom: 14, gap: 16 },
  dateBox: { alignItems: 'center', width: 48 }, day: { fontFamily: SERIF, fontSize: 30, color: C.gold }, mon: { color: C.mute },
  name: { fontFamily: SERIF, fontSize: 20, color: C.ivory }, meta: { color: C.mute, marginTop: 3 }, desc: { color: C.ivory, opacity: 0.75, marginTop: 6 },
  row: { flexDirection: 'row', gap: 22, marginTop: 10 }, link: { color: C.gold, fontSize: 15, paddingVertical: 4 },
  empty: { color: C.mute, textAlign: 'center', marginTop: 70, fontFamily: SERIF, fontSize: 17, lineHeight: 26 },
  fab: { position: 'absolute', right: 24, bottom: 36, width: 62, height: 62, borderRadius: 31, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  fabTxt: { fontSize: 34, color: C.bg, marginTop: -3 },
  lbl: { color: C.gold, marginTop: 20, marginBottom: 6, fontFamily: SERIF },
  input: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 4, padding: 14, color: C.ivory, fontSize: 16 },
  val: { color: C.ivory, fontSize: 16 }, err: { color: C.red, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: C.line, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 2 }, chipOn: { backgroundColor: C.gold, borderColor: C.gold }, chipTxt: { color: C.ivory },
  btn: { backgroundColor: C.gold, padding: 16, alignItems: 'center', marginTop: 30, borderRadius: 2 }, btnTxt: { color: C.bg, fontSize: 17, fontFamily: SERIF, fontWeight: '600' },
});