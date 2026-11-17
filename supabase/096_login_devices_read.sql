-- People can see their own sign-in devices in Settings, then Password and security (090 made the table).
drop policy if exists login_devices_own on public.login_devices;
create policy login_devices_own on public.login_devices for select using (user_id = auth.uid());
