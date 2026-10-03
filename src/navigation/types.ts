export type RootStackParamList = {
  Main: undefined;
  Record: {
    source?: 'manual' | 'reminder';
    reminderJobId?: number;
    editId?: number;
    initialAmount?: number;
  };
  Reminder: {
    reminderJobId?: number;
    kind?: 'water' | 'first_cup';
  };
};

export type MainTabParamList = {
  Home: undefined;
  Settings: undefined;
};
