// import { ActivityDto } from 'src/activity/activity.dto';

// export function modifyLocations(activity: ActivityDto) {
//   const { locations, date, description, duration, emotion, isSwitchOn, photoUrl, sport, title, speed } = activity;

//   const modifiedLocations = locations.map((location) => {
//     const {
//       coords: { accuracy, altitude, altitudeAccuracy, heading, latitude, longitude, speed },
//     } = location;

//     return {
//       mocked: location.mocked,
//       timestamp: location.timestamp,
//       accuracy,
//       altitude,
//       altitudeAccuracy,
//       heading,
//       latitude,
//       longitude,
//       speed,
//     };
//   });
//   return {
//     date,
//     description,
//     duration,
//     emotion,
//     isSwitchOn,
//     photoUrl,
//     sport,
//     title,
//     speed,
//     locations: modifiedLocations,
//   };
// }
